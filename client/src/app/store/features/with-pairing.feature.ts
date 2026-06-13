import { inject } from '@angular/core';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { HubService } from '../../api/hub.service';
import {
    ExportQrPayload,
    KnownList,
    ListFullError,
    ListMember,
    ReceiveQrPayload,
    ShareDelivery,
    SyncQrPayload,
    SyncSendQrPayload,
} from '../../core/models';
import { CryptoService } from '../../core/services/crypto.service';
import { DeviceIdService } from '../../core/services/device-id.service';
import { ForegroundService } from '../../core/services/foreground.service';
import { PushNotificationService } from '../../core/services/push-notification.service';

export function withPairing() {
    return signalStoreFeature(
        type<{
            state: {
                knownLists: KnownList[];
                currentListId: string | null;
                currentEncryptionKey: string | null;
            };
            methods: {
                _persistAndTrack(entry: KnownList): Promise<void>;
                _unregisterKnownList(listId: string): Promise<void>;
                _registerAsMember(listId: string, encryptionKey: string): Promise<void>;
            };
        }>(),

        withMethods((store) => {
            const api = inject(ApiService);
            const hub = inject(HubService);
            const crypto = inject(CryptoService);
            const push = inject(PushNotificationService);
            const deviceId = inject(DeviceIdService);
            const foreground = inject(ForegroundService);

            const pendingReceives = new Map<string, CryptoKey>();
            const pendingExportReceives = new Map<string, CryptoKey>();
            const pendingSyncReceives = new Map<string, CryptoKey>();

            return {
                generateKey(): Promise<string> {
                    return crypto.generateKey();
                },

                async initReceive(): Promise<ReceiveQrPayload> {
                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    const sessionId = self.crypto.randomUUID();
                    pendingReceives.set(sessionId, privateKey);
                    return { publicKey: publicKeyB64, sessionId };
                },

                async shareToReceiver(sessionId: string, receiverPublicKeyB64: string): Promise<void> {
                    const listId = store.currentListId();
                    const listKey = store.currentEncryptionKey();
                    if (!listId || !listKey) throw new Error('No list is currently open.');

                    const listName = store.knownLists().find(l => l.id === listId)?.name ?? '';
                    const bundle = await crypto.wrapListKey(listKey, receiverPublicKeyB64);
                    const delivery: ShareDelivery = {
                        wrappedKey: bundle.wrappedKey,
                        senderPublicKey: bundle.senderPublicKey,
                        listId,
                        listName,
                    };
                    await firstValueFrom(api.deliverShare(sessionId, delivery));
                },

                async claimSharedKey(sessionId: string): Promise<string> {
                    const privateKey = pendingReceives.get(sessionId);
                    if (!privateKey) throw new Error('No pending receive for this session. Call initReceive() first.');

                    const delivery = await firstValueFrom(api.pollShare(sessionId));

                    pendingReceives.delete(sessionId);

                    const already = store.knownLists().find(l => l.id === delivery.listId);
                    if (already) return already.id;

                    const listKey = await crypto.unwrapListKey(delivery.wrappedKey, delivery.senderPublicKey, privateKey);

                    const entry: KnownList = { id: delivery.listId, encryptionKey: listKey, name: delivery.listName, addedAt: new Date().toISOString() };
                    await store._persistAndTrack(entry);
                    await hub.connect();
                    await hub.joinList(delivery.listId);
                    foreground.start();
                    await push.subscribeToList(delivery.listId);
                    try {
                        await store._registerAsMember(delivery.listId, listKey);
                    } catch (e: unknown) {
                        if (e instanceof ListFullError) await store._unregisterKnownList(delivery.listId);
                        throw e;
                    }

                    return delivery.listId;
                },

                async importFromLink(listId: string, encryptionKey: string, name: string): Promise<void> {
                    const already = store.knownLists().find((l) => l.id === listId);
                    if (already) return;
                    const entry: KnownList = { id: listId, encryptionKey, name, addedAt: new Date().toISOString() };
                    await store._persistAndTrack(entry);
                    await hub.connect();
                    await hub.joinList(listId);
                    foreground.start();
                    await push.subscribeToList(listId);
                    try {
                        await store._registerAsMember(listId, encryptionKey);
                    } catch (e: unknown) {
                        if (e instanceof ListFullError) await store._unregisterKnownList(listId);
                        throw e;
                    }
                },

                initExportForList(listId: string): ExportQrPayload {
                    const known = store.knownLists().find(l => l.id === listId);
                    if (!known) throw new Error('List not found.');
                    return { type: 'export', sessionId: self.crypto.randomUUID(), listId, listName: known.name };
                },

                async pollExportHandshake(sessionId: string, listId: string): Promise<boolean> {
                    const known = store.knownLists().find(l => l.id === listId);
                    if (!known) return false;
                    const handshake = await firstValueFrom(api.pollHandshake(sessionId));
                    const bundle = await crypto.wrapListKey(known.encryptionKey, handshake.receiverPublicKey);
                    const delivery: ShareDelivery = {
                        wrappedKey: bundle.wrappedKey,
                        senderPublicKey: bundle.senderPublicKey,
                        listId,
                        listName: known.name,
                    };
                    await firstValueFrom(api.deliverShare(sessionId, delivery));
                    return true;
                },

                async respondToExport(sessionId: string): Promise<void> {
                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    pendingExportReceives.set(sessionId, privateKey);
                    await firstValueFrom(api.postHandshake(sessionId, publicKeyB64));
                },

                async claimExportedKey(sessionId: string, listId: string, listName: string): Promise<string> {
                    const privateKey = pendingExportReceives.get(sessionId);
                    if (!privateKey) throw new Error('No pending export receive for this session.');
                    const delivery = await firstValueFrom(api.pollShare(sessionId));
                    pendingExportReceives.delete(sessionId);
                    const already = store.knownLists().find(l => l.id === listId);
                    if (already) return already.id;
                    const listKey = await crypto.unwrapListKey(delivery.wrappedKey, delivery.senderPublicKey, privateKey);
                    const entry: KnownList = { id: listId, encryptionKey: listKey, name: listName, addedAt: new Date().toISOString() };
                    await store._persistAndTrack(entry);
                    await hub.connect();
                    await hub.joinList(listId);
                    foreground.start();
                    await push.subscribeToList(listId);
                    try {
                        await store._registerAsMember(listId, listKey);
                    } catch (e: unknown) {
                        if (e instanceof ListFullError) await store._unregisterKnownList(listId);
                        throw e;
                    }
                    return listId;
                },

                async fetchMembersForList(listId: string, encryptionKey: string): Promise<ListMember[]> {
                    const records = await firstValueFrom(api.getMembers(listId));
                    const members: ListMember[] = [];
                    for (const r of records) {
                        try {
                            const plain = await crypto.decrypt(r.encryptedPayload, r.initializationVector, encryptionKey);
                            const parsed = JSON.parse(plain) as { deviceId: string; displayName: string; joinedAt: string };
                            members.push({
                                deviceId: parsed.deviceId,
                                displayName: parsed.displayName || 'Anonymous',
                                joinedAt: parsed.joinedAt,
                                isCurrentDevice: parsed.deviceId === deviceId.deviceId,
                                lastReadMessageAt: r.lastReadMessageAt,
                            });
                        } catch { }
                    }
                    return members;
                },

                async initSyncReceive(): Promise<SyncQrPayload> {
                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    const sessionId = self.crypto.randomUUID();
                    pendingSyncReceives.set(sessionId, privateKey);
                    return { type: 'sync', publicKey: publicKeyB64, sessionId };
                },

                async pushSyncBundle(sessionId: string, receiverPublicKeyB64: string): Promise<void> {
                    const lists = store.knownLists();
                    const payload = JSON.stringify(
                        lists.map(l => ({ id: l.id, name: l.name, encryptionKey: l.encryptionKey, ownerToken: l.ownerToken })),
                    );
                    const bundle = await crypto.wrapPayload(payload, receiverPublicKeyB64);
                    await firstValueFrom(api.putSyncBundle(sessionId, bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey));
                },

                async claimSyncBundle(sessionId: string): Promise<number> {
                    const privateKey = pendingSyncReceives.get(sessionId);
                    if (!privateKey) throw new Error('No pending sync receive for this session.');
                    const bundle = await firstValueFrom(api.getSyncBundle(sessionId));
                    pendingSyncReceives.delete(sessionId);
                    const plain = await crypto.unwrapPayload(bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey, privateKey);
                    const entries = JSON.parse(plain) as { id: string; name: string; encryptionKey: string; ownerToken?: string }[];
                    let imported = 0;
                    for (const e of entries) {
                        const already = store.knownLists().find(l => l.id === e.id);
                        if (already) {
                            if (e.ownerToken && !already.ownerToken) {
                                await store._persistAndTrack({ ...already, ownerToken: e.ownerToken });
                            }
                            void store._registerAsMember(e.id, e.encryptionKey).catch(() => { });
                            continue;
                        }
                        const entry: KnownList = { id: e.id, encryptionKey: e.encryptionKey, name: e.name, addedAt: new Date().toISOString(), ownerToken: e.ownerToken };
                        await store._persistAndTrack(entry);
                        await hub.connect();
                        await hub.joinList(e.id);
                        foreground.start();
                        await push.subscribeToList(e.id);
                        void store._registerAsMember(e.id, e.encryptionKey);
                        imported++;
                    }
                    return imported;
                },

                initSyncSend(): SyncSendQrPayload {
                    const sessionId = self.crypto.randomUUID();
                    return { type: 'sync-send', sessionId };
                },

                async respondToSyncSend(sessionId: string): Promise<void> {
                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    pendingSyncReceives.set(sessionId, privateKey);
                    await firstValueFrom(api.postHandshake(sessionId, publicKeyB64));
                },

                async pollAndPushSyncBundle(sessionId: string): Promise<void> {
                    const handshake = await firstValueFrom(api.pollHandshake(sessionId));
                    await this.pushSyncBundle(sessionId, handshake.receiverPublicKey);
                },
            };
        }),
    );
}
