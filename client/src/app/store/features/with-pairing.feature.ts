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
    SyncBundlePayload,
    SyncQrPayload,
} from '../../core/models';
import { CryptoService } from '../../core/services/crypto.service';
import { DeviceIdService } from '../../core/services/device-id.service';
import { UserIdService } from '../../core/services/user-id.service';
import { ForegroundService } from '../../core/services/foreground.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';

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
            const userId = inject(UserIdService);
            const foreground = inject(ForegroundService);
            const prefs = inject(UserPreferencesService);

            const pendingReceives = new Map<string, CryptoKey>();
            const pendingExportReceives = new Map<string, CryptoKey>();
            const pendingSyncReceives = new Map<string, CryptoKey>();
            const pendingSyncReplyReceives = new Map<string, CryptoKey>();
            const syncBundleClaimed = new Map<string, number>();

            // Lives as long as the (root-provided) store does, i.e. the whole
            // app session — unlike the components that read it, which get
            // destroyed and recreated on every navigation. Lets a remounted
            // lists/list-detail page paint members (and their avatars)
            // immediately from the last known fetch instead of a blank/empty
            // state while fetchMembersForList's network round-trip + decrypt
            // is in flight again.
            const membersCache = new Map<string, ListMember[]>();

            const buildSyncPayload = (): string => {
                const lists = store.knownLists();
                const payload: SyncBundlePayload = {
                    lists: lists.map(l => ({ id: l.id, name: l.name, encryptionKey: l.encryptionKey, ownerToken: l.ownerToken })),

                    senderName: prefs.senderName() || null,

                    userId: userId.userId(),
                    userIdCreatedAt: userId.createdAt(),
                };
                return JSON.stringify(payload);
            };

            const reconcileIdentity = (parsed: SyncBundlePayload): void => {
                if (!parsed.userId || parsed.userId === userId.userId()) return;

                const localCreatedAt = userId.createdAt();
                const remoteCreatedAt = parsed.userIdCreatedAt;
                if (!remoteCreatedAt) return;

                const remoteIsOlder = remoteCreatedAt < localCreatedAt
                    || (remoteCreatedAt === localCreatedAt && parsed.userId < userId.userId());

                if (!remoteIsOlder) return;

                userId.setUserId(parsed.userId, remoteCreatedAt);
                if (parsed.senderName && !prefs.senderName()) {
                    prefs.setSenderName(parsed.senderName);
                }
            };

            const mergeIncomingBundle = async (parsed: SyncBundlePayload): Promise<number> => {
                reconcileIdentity(parsed);

                let imported = 0;
                for (const e of parsed.lists) {
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
            };

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
                            const parsed = JSON.parse(plain) as { deviceId: string; userId?: string; displayName: string; joinedAt: string };
                            const isCurrentDevice = parsed.deviceId === deviceId.deviceId;
                            const isCurrentUser = isCurrentDevice
                                || (!!parsed.userId && parsed.userId === userId.userId());
                            members.push({
                                deviceId: parsed.deviceId,
                                userId: parsed.userId ?? null,
                                displayName: parsed.displayName || 'Anonymous',
                                joinedAt: parsed.joinedAt,
                                isCurrentDevice,
                                isCurrentUser,
                                lastReadMessageAt: r.lastReadMessageAt,
                            });
                        } catch { }
                    }
                    membersCache.set(listId, members);
                    return members;
                },

                peekCachedMembers(listId: string): ListMember[] {
                    return membersCache.get(listId) ?? [];
                },

                async initSyncReceive(): Promise<SyncQrPayload> {
                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    const sessionId = self.crypto.randomUUID();
                    pendingSyncReceives.set(sessionId, privateKey);
                    return { type: 'sync', publicKey: publicKeyB64, sessionId };
                },

                async initSyncSendToReceiver(sessionId: string, receiverPublicKeyB64: string): Promise<void> {
                    const payload = buildSyncPayload();
                    const bundle = await crypto.wrapPayload(payload, receiverPublicKeyB64);
                    await firstValueFrom(api.putSyncBundle(sessionId, bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey));

                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    pendingSyncReplyReceives.set(sessionId, privateKey);
                    await firstValueFrom(api.postHandshake(sessionId, publicKeyB64));
                },

                async claimSyncReply(sessionId: string): Promise<number | null> {
                    const privateKey = pendingSyncReplyReceives.get(sessionId);
                    if (!privateKey) throw new Error('No pending sync reply for this session.');

                    let bundle;
                    try {
                        bundle = await firstValueFrom(api.getSyncBundleReply(sessionId));
                    } catch {
                        return null;
                    }
                    pendingSyncReplyReceives.delete(sessionId);

                    const plain = await crypto.unwrapPayload(bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey, privateKey);
                    const parsed = JSON.parse(plain) as SyncBundlePayload;
                    return mergeIncomingBundle(parsed);
                },

                async claimSyncBundle(sessionId: string): Promise<number | null> {
                    const privateKey = pendingSyncReceives.get(sessionId);
                    if (!privateKey) throw new Error('No pending sync receive for this session.');

                    if (!syncBundleClaimed.has(sessionId)) {
                        let bundle;
                        try {
                            bundle = await firstValueFrom(api.getSyncBundle(sessionId));
                        } catch {
                            return null;
                        }
                        const plain = await crypto.unwrapPayload(bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey, privateKey);
                        const parsed = JSON.parse(plain) as SyncBundlePayload;
                        const imported = await mergeIncomingBundle(parsed);
                        syncBundleClaimed.set(sessionId, imported);
                    }

                    let handshake;
                    try {
                        handshake = await firstValueFrom(api.pollHandshake(sessionId));
                    } catch {
                        return null;
                    }
                    const payload = buildSyncPayload();
                    const reply = await crypto.wrapPayload(payload, handshake.receiverPublicKey);
                    await firstValueFrom(api.putSyncBundleReply(sessionId, reply.encryptedPayload, reply.iv, reply.senderPublicKey));

                    pendingSyncReceives.delete(sessionId);
                    const imported = syncBundleClaimed.get(sessionId) ?? 0;
                    syncBundleClaimed.delete(sessionId);
                    return imported;
                },
            };
        }),
    );
}
