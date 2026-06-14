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

            const buildSyncPayload = (): string => {
                const lists = store.knownLists();
                const payload: SyncBundlePayload = {
                    lists: lists.map(l => ({ id: l.id, name: l.name, encryptionKey: l.encryptionKey, ownerToken: l.ownerToken })),
                    // Carry the display name across so the other device shows up as "you"
                    // (same name) instead of "Anonymous" when it registers as a list member.
                    senderName: prefs.senderName() || null,
                    // Carry our person-identity across so the other device "remains"
                    // this same person — its items/messages are recognized as "mine" too.
                    userId: userId.userId(),
                };
                return JSON.stringify(payload);
            };

            const mergeIncomingBundle = async (
                parsed: SyncBundlePayload,
                options: { adoptIdentity: boolean },
            ): Promise<number> => {
                if (options.adoptIdentity) {
                    // Adopt the other device's display name so this device shows up as
                    // "you" (same name) in member lists/chat, rather than "Anonymous".
                    if (parsed.senderName && !prefs.senderName()) {
                        prefs.setSenderName(parsed.senderName);
                    }

                    // Adopt the other device's userId — both devices now represent the
                    // same person, so this device's items/messages are recognized as
                    // "mine" everywhere too, and unread counts stay correct after sync.
                    if (parsed.userId) {
                        userId.setUserId(parsed.userId);
                    }
                }

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
                    return members;
                },

                async initSyncReceive(): Promise<SyncQrPayload> {
                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    const sessionId = self.crypto.randomUUID();
                    pendingSyncReceives.set(sessionId, privateKey);
                    return { type: 'sync', publicKey: publicKeyB64, sessionId };
                },

                /**
                 * Sender side (scanned the receiver's QR / opened its link): push our
                 * own lists + identity to the receiver, encrypted to its public key,
                 * then publish an ephemeral public key via the handshake slot so the
                 * receiver can send its lists back to us.
                 */
                async initSyncSendToReceiver(sessionId: string, receiverPublicKeyB64: string): Promise<void> {
                    const payload = buildSyncPayload();
                    const bundle = await crypto.wrapPayload(payload, receiverPublicKeyB64);
                    await firstValueFrom(api.putSyncBundle(sessionId, bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey));

                    const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
                    pendingSyncReplyReceives.set(sessionId, privateKey);
                    await firstValueFrom(api.postHandshake(sessionId, publicKeyB64));
                },

                /**
                 * Sender side: poll for the receiver's reply bundle (its lists +
                 * identity, encrypted to the ephemeral key from initSyncSendToReceiver)
                 * and merge it in. Returns null while not yet available (keep polling),
                 * or the number of newly-imported lists once done. We keep our own
                 * identity — the receiver already adopted it.
                 */
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
                    return mergeIncomingBundle(parsed, { adoptIdentity: false });
                },

                /**
                 * Receiver side (generated the QR/link): claim the sender's bundle,
                 * merge its lists in and adopt its identity (userId/senderName), then
                 * send our own (now-merged) lists back so the sender ends up with the
                 * same set of lists too. Returns null while not yet complete (keep
                 * polling), or the number of newly-imported lists once both steps are
                 * done.
                 */
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
                        const imported = await mergeIncomingBundle(parsed, { adoptIdentity: true });
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
