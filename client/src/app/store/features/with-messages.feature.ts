import { inject } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { CreateGhostMessageRequest, GhostChatMessage } from '../../core/models';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { CryptoService } from '../../core/services/crypto.service';
import { DeviceIdService } from '../../core/services/device-id.service';
import { ListStorageService } from '../../core/services/list-storage.service';
import { UserIdService } from '../../core/services/user-id.service';
import { isNetworkError, resolveCreatedMessageId, tempId } from '../store-utils';

export interface MessagesStoreSlice extends WritableStateSource<{ messages: GhostChatMessage[]; pendingOpsCount: number }> {
    currentListId: () => string | null;
    currentEncryptionKey: () => string | null;
    messages: () => GhostChatMessage[];
    pendingOpsCount: () => number;
    _persistCurrentList: () => Promise<void>;
    _enqueueOp: (op: Parameters<ListStorageService['addPendingOp']>[0]) => Promise<void>;
}

export function createMessagesMethods(store: MessagesStoreSlice) {
    const api = inject(ApiService);
    const crypto = inject(CryptoService);
    const deviceId = inject(DeviceIdService);
    const userId = inject(UserIdService);
    const storage = inject(ListStorageService);
    const connectivity = inject(ConnectivityService);

    return {
        async sendMessage(plainMessage: string, plainSenderName: string, replyToMessageId?: string | null): Promise<void> {
            const listId = store.currentListId();
            const key = store.currentEncryptionKey();
            if (!listId || !key) return;

            const [msg, sender] = await Promise.all([
                crypto.encrypt(plainMessage, key),
                crypto.encrypt(plainSenderName, key),
            ]);

            const payload: CreateGhostMessageRequest = {
                ghostListId: listId,
                encryptedMessage: msg.ciphertext,
                messageInitializationVector: msg.iv,
                encryptedSenderName: sender.ciphertext,
                senderNameInitializationVector: sender.iv,
                replyToMessageId: replyToMessageId ?? null,
            };

            const id = tempId();
            const optimisticMessage: GhostChatMessage = {
                id,
                ghostListId: listId,
                encryptedMessage: payload.encryptedMessage,
                messageInitializationVector: payload.messageInitializationVector,
                encryptedSenderName: payload.encryptedSenderName,
                senderNameInitializationVector: payload.senderNameInitializationVector,
                replyToMessageId: payload.replyToMessageId ?? null,
                createdAt: new Date().toISOString(),
                senderDeviceId: deviceId.deviceId,
                senderUserId: userId.userId(),
            };

            patchState(store, { messages: [...store.messages(), optimisticMessage] });
            void store._persistCurrentList();

            try {
                const realId = await firstValueFrom(api.createMessage(payload));
                patchState(store, { messages: resolveCreatedMessageId(store.messages(), id, realId) });
                void store._persistCurrentList();
            } catch (e: unknown) {
                if (!isNetworkError(e) || connectivity.online()) {
                    patchState(store, { messages: store.messages().filter(m => m.id !== id) });
                    void store._persistCurrentList();
                    throw e;
                }
                await store._enqueueOp({ type: 'sendMessage', listId, tempMessageId: id, payload, createdAt: new Date().toISOString() });
            }
        },

        async deleteMessage(messageId: string): Promise<void> {
            const prev = store.messages();
            patchState(store, { messages: prev.filter(m => m.id !== messageId) });
            void store._persistCurrentList();

            if (messageId.startsWith('local-')) {
                const ops = await storage.getPendingOps();
                const match = ops.find(o => o.type === 'sendMessage' && o.tempMessageId === messageId);
                if (match?.localId !== undefined) {
                    await storage.removePendingOp(match.localId);
                    patchState(store, { pendingOpsCount: Math.max(0, store.pendingOpsCount() - 1) });
                }
                return;
            }

            try {
                await firstValueFrom(api.deleteMessage(messageId));
            } catch (e: unknown) {
                if (!isNetworkError(e)) {
                    patchState(store, { messages: prev });
                    void store._persistCurrentList();
                    throw e;
                }
                await store._enqueueOp({ type: 'deleteMessage', listId: store.currentListId() ?? '', messageId, createdAt: new Date().toISOString() });
            }
        },
    };
}
