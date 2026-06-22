import { inject } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { CreateGhostListItemRequest, GhostListItem } from '../../core/models';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { CryptoService } from '../../core/services/crypto.service';
import { DeviceIdService } from '../../core/services/device-id.service';
import { ListStorageService } from '../../core/services/list-storage.service';
import { UserIdService } from '../../core/services/user-id.service';
import { isNetworkError, resolveCreatedItemId, tempId } from '../store-utils';

export interface ItemsStoreSlice extends WritableStateSource<{ items: GhostListItem[]; pendingOpsCount: number }> {
    currentListId: () => string | null;
    currentEncryptionKey: () => string | null;
    items: () => GhostListItem[];
    pendingOpsCount: () => number;
    _persistCurrentList: () => Promise<void>;
    _enqueueOp: (op: Parameters<ListStorageService['addPendingOp']>[0]) => Promise<void>;
    _upsertToggleOp: (listId: string, itemId: string, desiredChecked: boolean, createdAt: string) => Promise<void>;
    _bumpListActivity: (listId: string, at?: string) => void;
}

export function createItemsMethods(store: ItemsStoreSlice) {
    const api = inject(ApiService);
    const crypto = inject(CryptoService);
    const deviceId = inject(DeviceIdService);
    const userId = inject(UserIdService);
    const storage = inject(ListStorageService);
    const connectivity = inject(ConnectivityService);

    return {
        async addItem(plaintext: string): Promise<void> {
            const listId = store.currentListId();
            const key = store.currentEncryptionKey();
            if (!listId || !key) return;

            const { ciphertext, iv } = await crypto.encrypt(plaintext, key);
            const payload: CreateGhostListItemRequest = {
                ghostListId: listId,
                encryptedPayload: ciphertext,
                initializationVector: iv,
            };

            const id = tempId();
            const optimisticItem: GhostListItem = {
                id,
                ghostListId: listId,
                encryptedPayload: ciphertext,
                initializationVector: iv,
                isChecked: false,
                checkedAt: null,
                createdAt: new Date().toISOString(),
                senderDeviceId: deviceId.deviceId,
                senderUserId: userId.userId(),
                checkedByDeviceId: null,
                checkedByUserId: null,
            };
            patchState(store, { items: [...store.items(), optimisticItem] });
            void store._persistCurrentList();
            store._bumpListActivity(listId, optimisticItem.createdAt);

            try {
                const realId = await firstValueFrom(api.createItem(payload));
                patchState(store, { items: resolveCreatedItemId(store.items(), id, realId) });
                void store._persistCurrentList();
            } catch (e: unknown) {
                if (!isNetworkError(e) || connectivity.online()) {
                    patchState(store, { items: store.items().filter(i => i.id !== id) });
                    void store._persistCurrentList();
                    throw e;
                }
                await store._enqueueOp({ type: 'createItem', listId, tempItemId: id, payload, createdAt: new Date().toISOString() });
            }
        },

        async toggleItem(itemId: string): Promise<void> {
            const prev = store.items();
            const desiredChecked = !(prev.find(i => i.id === itemId)?.isChecked ?? false);
            patchState(store, {
                items: prev.map(i =>
                    i.id === itemId
                        ? {
                            ...i,
                            isChecked: !i.isChecked,
                            checkedAt: !i.isChecked ? new Date().toISOString() : null,
                            checkedByDeviceId: !i.isChecked ? deviceId.deviceId : null,
                            checkedByUserId: !i.isChecked ? userId.userId() : null,
                        }
                        : i,
                ),
            });
            void store._persistCurrentList();

            if (itemId.startsWith('local-')) return;

            try {
                await firstValueFrom(api.toggleItem(itemId));
            } catch (e: unknown) {
                if (!isNetworkError(e)) {
                    patchState(store, { items: prev });
                    void store._persistCurrentList();
                    throw e;
                }
                await store._upsertToggleOp(store.currentListId() ?? '', itemId, desiredChecked, new Date().toISOString());
            }
        },

        async deleteItem(itemId: string): Promise<void> {
            const prev = store.items();
            patchState(store, { items: prev.filter(i => i.id !== itemId) });
            void store._persistCurrentList();

            if (itemId.startsWith('local-')) {
                const ops = await storage.getPendingOps();
                const match = ops.find(o => o.type === 'createItem' && o.tempItemId === itemId);
                if (match?.localId !== undefined) {
                    await storage.removePendingOp(match.localId);
                    patchState(store, { pendingOpsCount: Math.max(0, store.pendingOpsCount() - 1) });
                }
                return;
            }

            try {
                await firstValueFrom(api.deleteItem(itemId));
            } catch (e: unknown) {
                if (!isNetworkError(e)) {
                    patchState(store, { items: prev });
                    void store._persistCurrentList();
                    throw e;
                }
                await store._enqueueOp({ type: 'deleteItem', listId: store.currentListId() ?? '', itemId, createdAt: new Date().toISOString() });
            }
        },
    };
}
