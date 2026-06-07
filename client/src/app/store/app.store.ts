import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { HubService } from '../api/hub.service';
import {
    DeleteAfterDuration,
    ExportQrPayload,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    KnownList,
    ListMember,
    ReceiveQrPayload,
    ShareDelivery,
    SyncQrPayload,
    SyncSendQrPayload,
} from '../core/models';
import { CryptoService } from '../core/services/crypto.service';
import { DeviceIdService } from '../core/services/device-id.service';
import { HapticsService } from '../core/services/haptics.service';
import { ListStorageService } from '../core/services/list-storage.service';
import { PushNotificationService } from '../core/services/push-notification.service';
import { UserPreferencesService } from '../core/services/user-preferences.service';

interface AppState {

    knownLists: KnownList[];

    unreadCounts: Record<string, number>;

    currentListId: string | null;

    currentEncryptionKey: string | null;

    currentList: GhostList | null;

    items: GhostListItem[];

    messages: GhostChatMessage[];

    listsLoaded: boolean;

    loading: boolean;
    error: string | null;
}

const initialState: AppState = {
    knownLists: [],
    unreadCounts: {},
    currentListId: null,
    currentEncryptionKey: null,
    currentList: null,
    items: [],
    messages: [],
    listsLoaded: false,
    loading: false,
    error: null,
};

export const AppStore = signalStore(
    { providedIn: 'root' },

    withState(initialState),

    withComputed((store) => ({

        isListOpen: computed(() => store.currentListId() !== null && store.currentList() !== null),

        activeItems: computed(() => store.items().filter((i) => !i.isChecked)),

        checkedItems: computed(() => store.items().filter((i) => i.isChecked)),

        totalUnread: computed(() => Object.values(store.unreadCounts()).reduce((a, b) => a + b, 0)),

        canShare: computed(() => store.currentListId() !== null && store.currentEncryptionKey() !== null),

        /** True when the current device is the owner of the currently open list. */
        isCurrentListOwner: computed(() => {
            const id = store.currentListId();
            if (!id) return false;
            return !!store.knownLists().find(l => l.id === id)?.ownerToken;
        }),
    })),

    withMethods((store) => {
        const api = inject(ApiService);
        const hub = inject(HubService);
        const storage = inject(ListStorageService);
        const crypto = inject(CryptoService);
        const push = inject(PushNotificationService);
        const deviceId = inject(DeviceIdService);
        const prefs = inject(UserPreferencesService);

        function setError(error: string | null) {
            patchState(store, { error, loading: false });
        }

        const UNREAD_KEY = 'gl_unread_counts';

        function loadPersistedUnread(): Record<string, number> {
            try { return JSON.parse(localStorage.getItem(UNREAD_KEY) ?? '{}'); } catch { return {}; }
        }

        function persistUnread(counts: Record<string, number>): void {
            localStorage.setItem(UNREAD_KEY, JSON.stringify(counts));
        }

        function incrementUnread(listId: string) {
            const counts = { ...store.unreadCounts() };
            counts[listId] = (counts[listId] ?? 0) + 1;
            patchState(store, { unreadCounts: counts });
            persistUnread(counts);
        }

        async function persistAndTrack(entry: KnownList): Promise<void> {
            await storage.upsert(entry);
            patchState(store, {
                knownLists: [...store.knownLists().filter((l) => l.id !== entry.id), entry],
            });
        }

        /** Encrypt and upsert this device's member record for a list. Fire-and-forget safe. */
        async function registerAsMember(listId: string, encryptionKey: string): Promise<void> {
            registeredThisSession.add(listId);
            try {
                const payload = JSON.stringify({
                    deviceId: deviceId.deviceId,
                    displayName: prefs.senderName() || 'Anonymous',
                    joinedAt: new Date().toISOString(),
                });
                const { ciphertext, iv } = await crypto.encrypt(payload, encryptionKey);
                await firstValueFrom(api.upsertMember(listId, deviceId.deviceId, ciphertext, iv));
            } catch { /* non-critical — don't block join on member registration failure */ }
        }

        /** Fetch and decrypt all member records for a list. */
        async function fetchMembersForList(listId: string, encryptionKey: string): Promise<ListMember[]> {
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
                    });
                } catch { /* skip undecryptable records */ }
            }
            return members;
        }

        async function loadKnownLists(): Promise<void> {
            let knownLists: KnownList[];
            try {
                knownLists = await storage.getAll();
            } catch {
                // IDB unavailable — unblock all waiters so the app doesn't hang.
                patchState(store, { listsLoaded: true });
                return;
            }
            patchState(store, { knownLists, unreadCounts: loadPersistedUnread(), listsLoaded: true });

            if (knownLists.length === 0) return;
            const checks = await Promise.all(
                knownLists.map(async (l) => ({
                    id: l.id,
                    alive: await firstValueFrom(api.checkList(l.id))
                        .then(() => true)
                        .catch((err: unknown) =>

                            !(err instanceof HttpErrorResponse && err.status === 404),
                        ),
                })),
            );
            const deadIds = checks.filter(c => !c.alive).map(c => c.id);
            if (deadIds.length === 0) return;
            await Promise.all(deadIds.map(id => storage.remove(id)));
            patchState(store, { knownLists: store.knownLists().filter(l => !deadIds.includes(l.id)) });
        }

        // Tracks which lists have already had registerAsMember called this session
        const registeredThisSession = new Set<string>();

        const pendingReceives = new Map<string, CryptoKey>();
        const pendingExportReceives = new Map<string, CryptoKey>();

        async function initReceive(): Promise<ReceiveQrPayload> {
            const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
            const sessionId = self.crypto.randomUUID();
            pendingReceives.set(sessionId, privateKey);
            return { publicKey: publicKeyB64, sessionId };
        }

        async function shareToReceiver(sessionId: string, receiverPublicKeyB64: string): Promise<void> {
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
        }

        async function claimSharedKey(sessionId: string): Promise<string> {
            const privateKey = pendingReceives.get(sessionId);
            if (!privateKey) throw new Error('No pending receive for this session. Call initReceive() first.');

            const delivery = await firstValueFrom(api.pollShare(sessionId));

            pendingReceives.delete(sessionId);

            const already = store.knownLists().find(l => l.id === delivery.listId);
            if (already) return already.id;

            const listKey = await crypto.unwrapListKey(delivery.wrappedKey, delivery.senderPublicKey, privateKey);

            const entry: KnownList = { id: delivery.listId, encryptionKey: listKey, name: delivery.listName, addedAt: new Date().toISOString() };
            await persistAndTrack(entry);
            await hub.connect();
            await hub.joinList(delivery.listId);
            await push.subscribeToList(delivery.listId);
            void registerAsMember(delivery.listId, listKey);

            return delivery.listId;
        }

        function generateKey(): Promise<string> {
            return crypto.generateKey();
        }

        function initExportForList(listId: string): ExportQrPayload {
            const known = store.knownLists().find(l => l.id === listId);
            if (!known) throw new Error('List not found.');
            return { type: 'export', sessionId: self.crypto.randomUUID(), listId, listName: known.name };
        }

        async function pollExportHandshake(sessionId: string, listId: string): Promise<boolean> {
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
        }

        async function respondToExport(sessionId: string): Promise<void> {
            const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
            pendingExportReceives.set(sessionId, privateKey);
            await firstValueFrom(api.postHandshake(sessionId, publicKeyB64));
        }

        async function claimExportedKey(sessionId: string, listId: string, listName: string): Promise<string> {
            const privateKey = pendingExportReceives.get(sessionId);
            if (!privateKey) throw new Error('No pending export receive for this session.');
            const delivery = await firstValueFrom(api.pollShare(sessionId));
            pendingExportReceives.delete(sessionId);
            const already = store.knownLists().find(l => l.id === listId);
            if (already) return already.id;
            const listKey = await crypto.unwrapListKey(delivery.wrappedKey, delivery.senderPublicKey, privateKey);
            const entry: KnownList = { id: listId, encryptionKey: listKey, name: listName, addedAt: new Date().toISOString() };
            await persistAndTrack(entry);
            await hub.connect();
            await hub.joinList(listId);
            await push.subscribeToList(listId);
            void registerAsMember(listId, listKey);
            return listId;
        }

        async function importFromLink(listId: string, encryptionKey: string, name: string): Promise<void> {
            const already = store.knownLists().find((l) => l.id === listId);
            if (already) return;
            const entry: KnownList = { id: listId, encryptionKey, name, addedAt: new Date().toISOString() };
            await persistAndTrack(entry);
            await hub.connect();
            await hub.joinList(listId);
            await push.subscribeToList(listId);
            void registerAsMember(listId, encryptionKey);
        }

        // ── Sync Machine ────────────────────────────────────────────────────

        const pendingSyncReceives = new Map<string, CryptoKey>();

        async function initSyncReceive(): Promise<SyncQrPayload> {
            const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
            const sessionId = self.crypto.randomUUID();
            pendingSyncReceives.set(sessionId, privateKey);
            return { type: 'sync', publicKey: publicKeyB64, sessionId };
        }

        async function pushSyncBundle(sessionId: string, receiverPublicKeyB64: string): Promise<void> {
            const lists = store.knownLists();
            const payload = JSON.stringify(
                lists.map(l => ({ id: l.id, name: l.name, encryptionKey: l.encryptionKey, ownerToken: l.ownerToken })),
            );
            const bundle = await crypto.wrapPayload(payload, receiverPublicKeyB64);
            await firstValueFrom(api.putSyncBundle(sessionId, bundle.encryptedPayload, bundle.iv, bundle.senderPublicKey));
        }

        async function claimSyncBundle(sessionId: string): Promise<number> {
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
                    // Already have it — backfill ownerToken if sender had it and we don't
                    if (e.ownerToken && !already.ownerToken) {
                        await persistAndTrack({ ...already, ownerToken: e.ownerToken });
                    }
                    void registerAsMember(e.id, e.encryptionKey);
                    continue;
                }
                const entry: KnownList = { id: e.id, encryptionKey: e.encryptionKey, name: e.name, addedAt: new Date().toISOString(), ownerToken: e.ownerToken };
                await persistAndTrack(entry);
                await hub.connect();
                await hub.joinList(e.id);
                await push.subscribeToList(e.id);
                void registerAsMember(e.id, e.encryptionKey);
                imported++;
            }
            return imported;
        }

        // ── Sync Machine — sender-initiated (mirrors export flow for individual lists) ─

        /** Sender side: generates a session. The QR shows only the sessionId — no crypto keys.
         *  The receiver scans, generates a keypair, and posts it as a handshake. */
        function initSyncSend(): SyncSendQrPayload {
            const sessionId = self.crypto.randomUUID();
            return { type: 'sync-send', sessionId };
        }

        /** Receiver side: called after scanning sender's QR.
         *  Generates ECDH keypair, stores private key for later decryption, posts public key as handshake. */
        async function respondToSyncSend(sessionId: string): Promise<void> {
            const { publicKeyB64, privateKey } = await crypto.generateEcdhKeypair();
            pendingSyncReceives.set(sessionId, privateKey);
            await firstValueFrom(api.postHandshake(sessionId, publicKeyB64));
        }

        /** Sender side: polls for receiver's handshake public key, then encrypts + uploads bundle. */
        async function pollAndPushSyncBundle(sessionId: string): Promise<void> {
            const handshake = await firstValueFrom(api.pollHandshake(sessionId));
            await pushSyncBundle(sessionId, handshake.receiverPublicKey);
        }

        return {
            loadKnownLists,
            generateKey,
            initReceive,
            shareToReceiver,
            claimSharedKey,
            importFromLink,
            initExportForList,
            pollExportHandshake,
            respondToExport,
            claimExportedKey,
            fetchMembersForList,
            initSyncReceive,
            pushSyncBundle,
            claimSyncBundle,
            initSyncSend,
            respondToSyncSend,
            pollAndPushSyncBundle,

            async createList(encryptionKey: string, name: string): Promise<string> {
                patchState(store, { loading: true });
                try {
                    // Generate a random owner token and send only its hash to the server.
                    // The raw token stays on the client — the server is zero-knowledge.
                    const tokenBytes = self.crypto.getRandomValues(new Uint8Array(32));
                    const ownerToken = btoa(String.fromCharCode(...tokenBytes));
                    const ownerTokenHash = await crypto.sha256Hex(ownerToken);

                    const id = await firstValueFrom(api.createList(ownerTokenHash));
                    const entry: KnownList = { id, encryptionKey, name, addedAt: new Date().toISOString(), ownerToken };
                    await persistAndTrack(entry);
                    await hub.joinList(id);
                    await push.subscribeToList(id);
                    void registerAsMember(id, encryptionKey);
                    return id;
                } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Failed to create list');
                    throw e;
                } finally {
                    patchState(store, { loading: false });
                }
            },

            async joinList(id: string, encryptionKey: string): Promise<void> {
                // Register this device as a member if not yet done this session.
                // Covers: existing lists from before this feature, and link-join (importFromLink
                // skips registration when already known).
                if (!registeredThisSession.has(id)) {
                    void registerAsMember(id, encryptionKey);
                }

                if (store.currentListId() === id) return;

                patchState(store, {
                    currentListId: id,
                    currentEncryptionKey: encryptionKey,
                    currentList: null,
                    items: [],
                    messages: [],
                    error: null,
                    loading: true,
                    unreadCounts: { ...store.unreadCounts(), [id]: 0 },
                });
                persistUnread({ ...store.unreadCounts(), [id]: 0 });

                try {
                    await hub.connect();
                    await hub.joinList(id);

                    const list = await firstValueFrom(api.getList(id));
                    patchState(store, {
                        currentList: list,
                        items: list.items as unknown as GhostListItem[],
                        messages: list.chatMessages as GhostChatMessage[],
                        loading: false,
                    });
                } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Failed to open list');
                    throw e;
                }
            },

            async leaveCurrentList(): Promise<void> {
                patchState(store, {
                    currentListId: null,
                    currentEncryptionKey: null,
                    currentList: null,
                    items: [],
                    messages: [],
                    error: null,
                });

            },

            async deleteList(id: string): Promise<void> {
                patchState(store, { loading: true });
                try {
                    await push.unsubscribeFromList(id);
                    const ownerToken = store.knownLists().find(l => l.id === id)?.ownerToken;
                    await firstValueFrom(api.deleteList(id, ownerToken));
                    await hub.leaveList(id);
                    await storage.remove(id);
                    const knownLists = store.knownLists().filter((l) => l.id !== id);
                    const patch: Partial<AppState> = { knownLists, loading: false };
                    if (store.currentListId() === id) {
                        Object.assign(patch, {
                            currentListId: null,
                            currentEncryptionKey: null,
                            currentList: null,
                            items: [],
                            messages: [],
                        });
                    }
                    patchState(store, patch);
                } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Failed to delete list');
                    throw e;
                }
            },

            async renameList(id: string, name: string): Promise<void> {
                const existing = store.knownLists().find(l => l.id === id);
                if (!existing) return;
                await persistAndTrack({ ...existing, name });
            },

            async forgetList(id: string): Promise<void> {
                const known = store.knownLists().find(l => l.id === id);

                if (known?.ownerToken) {
                    // Owner forgetting = delete for everyone (server requires the owner token).
                    // deleteList handles unsubscribe, hub leave, storage removal, and state patch.
                    await this.deleteList(id);
                    return;
                }

                // Non-owner: remove locally only.
                // Fire-and-forget member record removal — best effort
                void firstValueFrom(api.deleteMember(id, deviceId.deviceId)).catch(() => { /* non-critical */ });
                await push.unsubscribeFromList(id);
                await hub.leaveList(id);
                await storage.remove(id);
                const knownLists = store.knownLists().filter((l) => l.id !== id);
                const patch: Partial<AppState> = { knownLists };
                if (store.currentListId() === id) {
                    Object.assign(patch, {
                        currentListId: null,
                        currentEncryptionKey: null,
                        currentList: null,
                        items: [],
                        messages: [],
                    });
                }
                patchState(store, patch);
            },

            async kickMember(listId: string, targetDeviceId: string): Promise<void> {
                const ownerToken = store.knownLists().find(l => l.id === listId)?.ownerToken;
                if (!ownerToken) throw new Error('Not the list owner.');
                await firstValueFrom(api.kickMember(listId, targetDeviceId, ownerToken));
            },

            async updateTtl(ttl: DeleteAfterDuration): Promise<void> {
                const id = store.currentListId();
                if (!id) return;
                await firstValueFrom(api.updateTtl(id, ttl));

            },

            async addItem(plaintext: string): Promise<void> {
                const listId = store.currentListId();
                const key = store.currentEncryptionKey();
                if (!listId || !key) return;

                const { ciphertext, iv } = await crypto.encrypt(plaintext, key);
                await firstValueFrom(
                    api.createItem({ ghostListId: listId, encryptedPayload: ciphertext, initializationVector: iv }),
                );

            },

            async toggleItem(itemId: string): Promise<void> {

                const prev = store.items();
                patchState(store, {
                    items: prev.map(i =>
                        i.id === itemId
                            ? { ...i, isChecked: !i.isChecked, checkedAt: !i.isChecked ? new Date().toISOString() : null }
                            : i,
                    ),
                });

                await firstValueFrom(api.toggleItem(itemId)).catch((e: unknown) => {
                    patchState(store, { items: prev });
                    throw e;
                });
            },

            async deleteItem(itemId: string): Promise<void> {
                await firstValueFrom(api.deleteItem(itemId));
            },

            async sendMessage(plainMessage: string, plainSenderName: string): Promise<void> {
                const listId = store.currentListId();
                const key = store.currentEncryptionKey();
                if (!listId || !key) return;

                const [msg, sender] = await Promise.all([
                    crypto.encrypt(plainMessage, key),
                    crypto.encrypt(plainSenderName, key),
                ]);

                await firstValueFrom(
                    api.createMessage({
                        ghostListId: listId,
                        encryptedMessage: msg.ciphertext,
                        messageInitializationVector: msg.iv,
                        encryptedSenderName: sender.ciphertext,
                        senderNameInitializationVector: sender.iv,
                    }),
                );

            },

            async deleteMessage(messageId: string): Promise<void> {
                await firstValueFrom(api.deleteMessage(messageId));

            },

            _incrementUnread: incrementUnread,
        };
    }),

    withHooks((store) => {
        const hub = inject(HubService);
        const haptics = inject(HapticsService);
        const push = inject(PushNotificationService);
        const deviceId = inject(DeviceIdService);

        return {
            async onInit() {

                await store.loadKnownLists();

                if (store.knownLists().length > 0) {
                    await hub.connect();
                    await Promise.all(store.knownLists().map((l) => hub.joinList(l.id)));
                }

                // Initialize push notifications (iOS only, no-op on web)
                await push.initialize(store.knownLists().map(l => l.id));

                hub.itemCreated$.subscribe((event) => {
                    if (event.ghostListId !== store.currentListId()) {
                        store._incrementUnread(event.ghostListId);
                        return;
                    }
                    const newItem = {
                        id: event.id,
                        ghostListId: event.ghostListId,
                        encryptedPayload: event.encryptedPayload,
                        initializationVector: event.initializationVector,
                        isChecked: event.isChecked,
                        checkedAt: null,
                        createdAt: event.createdAt,
                    } satisfies GhostListItem;
                    patchState(store, { items: [...store.items(), newItem] });
                    haptics.itemAdded();
                });

                hub.itemToggled$.subscribe((event) => {
                    patchState(store, {
                        items: store.items().map((i) =>
                            i.id === event.itemId
                                ? { ...i, isChecked: event.isChecked, checkedAt: event.checkedAt }
                                : i,
                        ),
                    });
                });

                hub.itemDeleted$.subscribe((itemId) => {
                    patchState(store, { items: store.items().filter((i) => i.id !== itemId) });
                    haptics.itemDeleted();
                });

                hub.messageReceived$.subscribe((event) => {
                    haptics.messageReceived();
                    if (event.ghostListId !== store.currentListId()) {
                        store._incrementUnread(event.ghostListId);
                        return;
                    }
                    const newMessage = {
                        id: event.id,
                        ghostListId: event.ghostListId,
                        encryptedMessage: event.encryptedMessage,
                        messageInitializationVector: event.initializationVector,
                        encryptedSenderName: event.encryptedSenderName,
                        senderNameInitializationVector: event.senderNameInitializationVector,
                        createdAt: event.createdAt,
                    } satisfies GhostChatMessage;
                    patchState(store, { messages: [...store.messages(), newMessage] });
                });

                hub.messageDeleted$.subscribe((messageId) => {
                    patchState(store, { messages: store.messages().filter((m) => m.id !== messageId) });
                });

                hub.ttlUpdated$.subscribe((newTtl) => {
                    const current = store.currentList();
                    if (current) patchState(store, { currentList: { ...current, ttl: newTtl } });
                });

                hub.listDeleted$.subscribe(async (listId) => {

                    await store.forgetList(listId);
                });

                hub.memberKicked$.subscribe(async ({ listId, deviceId: kickedDeviceId }) => {
                    if (kickedDeviceId === deviceId.deviceId) {
                        // We were kicked — forget that list regardless of which one is active.
                        await store.forgetList(listId);
                    }
                });

                hub.reconnected$.subscribe(async () => {
                    const lists = store.knownLists();
                    if (lists.length > 0) {
                        await Promise.all(lists.map((l) => hub.joinList(l.id)));
                    }
                });
            },

            onDestroy() {
                hub.disconnect();
            },
        };
    }),
);
