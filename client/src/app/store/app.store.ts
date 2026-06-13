import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { HubService } from '../api/hub.service';
import {
    CreateGhostListItemRequest,
    CreateGhostMessageRequest,
    DeleteAfterDuration,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    ImageSharedEvent,
    KnownList,
} from '../core/models';
import { ConnectivityService } from '../core/services/connectivity.service';
import { CryptoService } from '../core/services/crypto.service';
import { DeviceIdService } from '../core/services/device-id.service';
import { UserIdService } from '../core/services/user-id.service';
import { ForegroundService } from '../core/services/foreground.service';
import { HapticsService } from '../core/services/haptics.service';
import { ListStorageService } from '../core/services/list-storage.service';
import { PushNotificationService } from '../core/services/push-notification.service';
import { withListSync } from './features/with-list-sync.feature';

interface AppState {

    knownLists: KnownList[];

    currentListId: string | null;

    currentEncryptionKey: string | null;

    currentList: GhostList | null;

    items: GhostListItem[];

    messages: GhostChatMessage[];

    imageDataUrls: Record<string, string>;

    listsLoaded: boolean;

    /** Number of mutations queued locally, waiting to be sent once back online. */
    pendingOpsCount: number;

    loading: boolean;
    error: string | null;
}

const initialState: AppState = {
    knownLists: [],
    currentListId: null,
    currentEncryptionKey: null,
    currentList: null,
    items: [],
    messages: [],
    imageDataUrls: {},
    listsLoaded: false,
    pendingOpsCount: 0,
    loading: false,
    error: null,
};

/** True for HttpClient errors caused by the request never reaching the server (offline). */
function isNetworkError(e: unknown): boolean {
    return e instanceof HttpErrorResponse && e.status === 0;
}

/** Generates a local-only id for optimistic items/messages created while offline. */
function tempId(): string {
    return `local-${self.crypto.randomUUID()}`;
}

/**
 * Resolves an optimistic item's temp id to its real server id once `createItem`
 * returns. The server's SignalR broadcast is sent to all list members including
 * the creator, so it can race with this response and add the real item first —
 * in that case drop our optimistic placeholder instead of creating a duplicate.
 */
function resolveCreatedItemId(items: GhostListItem[], tempItemId: string, realId: string): GhostListItem[] {
    if (items.some(i => i.id === realId)) {
        return items.filter(i => i.id !== tempItemId);
    }
    return items.map(i => i.id === tempItemId ? { ...i, id: realId } : i);
}

/** Same id-reconciliation as {@link resolveCreatedItemId}, but for chat messages. */
function resolveCreatedMessageId(messages: GhostChatMessage[], tempMessageId: string, realId: string): GhostChatMessage[] {
    if (messages.some(m => m.id === realId)) {
        return messages.filter(m => m.id !== tempMessageId);
    }
    return messages.map(m => m.id === tempMessageId ? { ...m, id: realId } : m);
}

export const AppStore = signalStore(
    { providedIn: 'root' },

    withState(initialState),

    withListSync(),

    withComputed((store) => {
        const connectivity = inject(ConnectivityService);

        return {

            online: computed(() => connectivity.online()),

            isListOpen: computed(() => store.currentListId() !== null && store.currentList() !== null),

            activeItems: computed(() => store.items().filter((i) => !i.isChecked)),

            checkedItems: computed(() => store.items().filter((i) => i.isChecked)),

            canShare: computed(() => store.currentListId() !== null && store.currentEncryptionKey() !== null),

            isCurrentListOwner: computed(() => {
                const id = store.currentListId();
                if (!id) return false;
                return !!store.knownLists().find(l => l.id === id)?.ownerToken;
            }),
        };
    }),

    withMethods((store) => {
        const api = inject(ApiService);
        const hub = inject(HubService);
        const storage = inject(ListStorageService);
        const crypto = inject(CryptoService);
        const push = inject(PushNotificationService);
        const deviceId = inject(DeviceIdService);
        const userId = inject(UserIdService);
        const foreground = inject(ForegroundService);

        function setError(error: string | null) {
            patchState(store, { error, loading: false });
        }

        const IMAGE_CACHE_LIMIT = 30;
        const imageCacheOrder: string[] = [];

        function cacheImage(messageId: string, dataUrl: string): void {
            const current = store.imageDataUrls();
            if (!(messageId in current)) {
                imageCacheOrder.push(messageId);
                if (imageCacheOrder.length > IMAGE_CACHE_LIMIT) {
                    const evict = imageCacheOrder.shift();
                    if (evict && evict in store.imageDataUrls()) {
                        const rest = { ...store.imageDataUrls() };
                        delete rest[evict];
                        patchState(store, { imageDataUrls: rest });
                    }
                }
            }
            patchState(store, { imageDataUrls: { ...store.imageDataUrls(), [messageId]: dataUrl } });
        }

        async function persistCurrentList(): Promise<void> {
            const id = store.currentListId();
            if (!id) return;
            const list = store.currentList();
            await storage.putListCache({
                id,
                ttl: list?.ttl ?? 0,
                createdAt: list?.createdAt ?? new Date().toISOString(),
                items: store.items(),
                messages: store.messages(),
                cachedAt: new Date().toISOString(),
            }).catch(() => { });
        }

        async function enqueueOp(op: Parameters<ListStorageService['addPendingOp']>[0]): Promise<void> {
            await storage.addPendingOp(op);
            patchState(store, { pendingOpsCount: store.pendingOpsCount() + 1 });
        }

        /**
         * Queues a toggle, collapsing it with any already-queued toggle for the same item so
         * repeated offline toggles converge to a single "desired final state" op instead of
         * stacking up redundant flips.
         */
        async function upsertToggleOp(listId: string, itemId: string, desiredChecked: boolean, createdAt: string): Promise<void> {
            const ops = await storage.getPendingOps();
            const existing = ops.find(o => o.type === 'toggleItem' && o.itemId === itemId);
            if (existing?.localId !== undefined) {
                await storage.removePendingOp(existing.localId);
                await storage.addPendingOp({ type: 'toggleItem', listId, itemId, desiredChecked, createdAt });
                return;
            }
            await enqueueOp({ type: 'toggleItem', listId, itemId, desiredChecked, createdAt });
        }

        let flushing = false;

        return {

            async createList(encryptionKey: string, name: string): Promise<string> {
                patchState(store, { loading: true });
                try {
                    const tokenBytes = self.crypto.getRandomValues(new Uint8Array(32));
                    const ownerToken = btoa(String.fromCharCode(...tokenBytes));
                    const ownerTokenHash = await crypto.sha256Hex(ownerToken);

                    const id = await firstValueFrom(api.createList(ownerTokenHash));
                    const entry: KnownList = { id, encryptionKey, name, addedAt: new Date().toISOString(), ownerToken };
                    await store._persistAndTrack(entry);
                    await hub.connect();
                    await hub.joinList(id);
                    foreground.start();
                    await push.subscribeToList(id);
                    void store._registerAsMember(id, encryptionKey);
                    return id;
                } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Failed to create list');
                    throw e;
                } finally {
                    patchState(store, { loading: false });
                }
            },

            async joinList(id: string, encryptionKey: string): Promise<void> {
                const registration = store._registerAsMember(id, encryptionKey);

                if (store.currentListId() === id) return;

                const cached = await storage.getListCache(id).catch(() => undefined);

                patchState(store, {
                    currentListId: id,
                    currentEncryptionKey: encryptionKey,
                    currentList: cached
                        ? { id: cached.id, ttl: cached.ttl, createdAt: cached.createdAt, items: cached.items, chatMessages: cached.messages }
                        : null,
                    items: cached?.items ?? [],
                    messages: cached?.messages ?? [],
                    error: null,
                    loading: !cached,
                    messagesReadDivider: { ...store.messagesReadDivider(), [id]: store.lastReadMessageAt()[id] ?? null },
                    itemsReadDivider: { ...store.itemsReadDivider(), [id]: store.lastReadItemAt()[id] ?? null },
                });

                try {
                    await hub.connect();
                    await hub.joinList(id);
                    foreground.start();
                } catch (e: unknown) {
                    patchState(store, { loading: false });
                    if (cached) return;
                    setError(e instanceof Error ? e.message : 'Failed to open list');
                    throw e;
                }

                try {
                    const list = await firstValueFrom(api.getList(id));
                    // The user may have navigated to a different list while this request
                    // was in flight. Don't clobber the now-current list's state (and don't
                    // decrypt its items/messages with the wrong encryption key).
                    if (store.currentListId() === id) {
                        patchState(store, {
                            currentList: list,
                            items: list.items,
                            messages: list.chatMessages,
                            loading: false,
                        });
                        void persistCurrentList();
                    }

                    await registration;
                    await Promise.all([store.markMessagesRead(id), store.markItemsRead(id)]);
                    if (store.currentListId() === id) void store.refreshOthersReadReceipt(id);
                } catch (e: unknown) {
                    if (store.currentListId() === id) patchState(store, { loading: false });
                    if (cached) return;
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
                    try {
                        await firstValueFrom(api.deleteList(id, ownerToken));
                    } catch (e: unknown) {
                        // Server-side cleanup may have already removed this list (e.g. it
                        // became memberless and was garbage-collected). Treat that as
                        // success so the stale entry still gets cleaned up locally.
                        if (!(e instanceof HttpErrorResponse && e.status === 404)) throw e;
                    }
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
                await store._persistAndTrack({ ...existing, name });
            },

            async forgetList(id: string): Promise<void> {
                const known = store.knownLists().find(l => l.id === id);

                if (known?.ownerToken) {
                    await this.deleteList(id);
                    return;
                }

                void firstValueFrom(api.deleteMember(id, deviceId.deviceId)).catch(() => { });
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
                const payload: CreateGhostListItemRequest = { ghostListId: listId, encryptedPayload: ciphertext, initializationVector: iv };

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
                };
                patchState(store, { items: [...store.items(), optimisticItem] });
                void persistCurrentList();

                try {
                    const realId = await firstValueFrom(api.createItem(payload));
                    patchState(store, {
                        items: resolveCreatedItemId(store.items(), id, realId),
                    });
                    void persistCurrentList();
                } catch (e: unknown) {
                    if (!isNetworkError(e)) {
                        patchState(store, { items: store.items().filter(i => i.id !== id) });
                        void persistCurrentList();
                        throw e;
                    }
                    await enqueueOp({ type: 'createItem', listId, tempItemId: id, payload, createdAt: new Date().toISOString() });
                }
            },

            async toggleItem(itemId: string): Promise<void> {

                const prev = store.items();
                const desiredChecked = !(prev.find(i => i.id === itemId)?.isChecked ?? false);
                patchState(store, {
                    items: prev.map(i =>
                        i.id === itemId
                            ? { ...i, isChecked: !i.isChecked, checkedAt: !i.isChecked ? new Date().toISOString() : null }
                            : i,
                    ),
                });
                void persistCurrentList();

                if (itemId.startsWith('local-')) {
                    // Item hasn't been created on the server yet (still queued). It'll be
                    // created in its current (unchecked) state once back online; the local
                    // toggle above keeps the UI in sync until then.
                    return;
                }

                try {
                    await firstValueFrom(api.toggleItem(itemId));
                } catch (e: unknown) {
                    if (!isNetworkError(e)) {
                        patchState(store, { items: prev });
                        void persistCurrentList();
                        throw e;
                    }
                    await upsertToggleOp(store.currentListId() ?? '', itemId, desiredChecked, new Date().toISOString());
                }
            },

            async deleteItem(itemId: string): Promise<void> {
                const prev = store.items();
                patchState(store, { items: prev.filter(i => i.id !== itemId) });
                void persistCurrentList();

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
                        void persistCurrentList();
                        throw e;
                    }
                    await enqueueOp({ type: 'deleteItem', listId: store.currentListId() ?? '', itemId, createdAt: new Date().toISOString() });
                }
            },

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

                patchState(store, {
                    messages: [...store.messages(), optimisticMessage],
                });
                void persistCurrentList();

                try {
                    const realId = await firstValueFrom(api.createMessage(payload));
                    patchState(store, {
                        messages: resolveCreatedMessageId(store.messages(), id, realId),
                    });
                    void persistCurrentList();
                } catch (e: unknown) {
                    if (!isNetworkError(e)) {
                        patchState(store, { messages: store.messages().filter(m => m.id !== id) });
                        void persistCurrentList();
                        throw e;
                    }
                    await enqueueOp({ type: 'sendMessage', listId, tempMessageId: id, payload, createdAt: new Date().toISOString() });
                }
            },

            async deleteMessage(messageId: string): Promise<void> {
                const prev = store.messages();
                patchState(store, { messages: prev.filter(m => m.id !== messageId) });
                void persistCurrentList();

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
                        void persistCurrentList();
                        throw e;
                    }
                    await enqueueOp({ type: 'deleteMessage', listId: store.currentListId() ?? '', messageId, createdAt: new Date().toISOString() });
                }
            },

            async shareImage(dataUrl: string, plainSenderName: string, replyToMessageId?: string | null): Promise<string> {
                const listId = store.currentListId();
                const key = store.currentEncryptionKey();
                if (!listId || !key) throw new Error('No list is currently open.');

                const placeholder = JSON.stringify({ type: 'image' });
                const [msg, sender, image] = await Promise.all([
                    crypto.encrypt(placeholder, key),
                    crypto.encrypt(plainSenderName, key),
                    crypto.encrypt(dataUrl, key),
                ]);

                const messageId = await firstValueFrom(
                    api.createMessage({
                        ghostListId: listId,
                        encryptedMessage: msg.ciphertext,
                        messageInitializationVector: msg.iv,
                        encryptedSenderName: sender.ciphertext,
                        senderNameInitializationVector: sender.iv,
                        replyToMessageId: replyToMessageId ?? null,
                    }),
                );

                cacheImage(messageId, dataUrl);

                try {
                    await hub.relayImage(listId, messageId, image.ciphertext, image.iv);
                } catch { }

                return messageId;
            },

            /**
             * Fetches and decrypts a chat image that wasn't received via the
             * live SignalR relay (e.g. this device was offline or hadn't
             * opened the list yet when it was sent). The server only retains
             * image blobs temporarily — a 404 means it already expired or
             * was never persisted, which is expected and not an error.
             * No-op if the image is already cached.
             */
            async fetchAndCacheImage(messageId: string): Promise<void> {
                if (store.imageDataUrls()[messageId]) return;

                const key = store.currentEncryptionKey();
                if (!key) return;

                try {
                    const image = await firstValueFrom(api.getMessageImage(messageId));
                    const dataUrl = await crypto.decrypt(image.encryptedImage, image.imageInitializationVector, key);
                    cacheImage(messageId, dataUrl);
                } catch {
                    // Not found/expired, offline, or decryption failed — leave
                    // the placeholder as-is.
                }
            },

            /** Replays queued offline mutations against the API. Safe to call repeatedly. */
            async flushPendingOps(): Promise<void> {
                if (flushing) return;
                flushing = true;
                try {
                    const ops = (await storage.getPendingOps().catch(() => []))
                        .slice()
                        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

                    // Cache one getItems() per list per flush, so multiple queued
                    // toggles against the same list don't each trigger a fetch.
                    const itemsCache = new Map<string, Promise<GhostListItem[]>>();
                    function getItemsCached(listId: string): Promise<GhostListItem[]> {
                        let pending = itemsCache.get(listId);
                        if (!pending) {
                            pending = firstValueFrom(api.getItems(listId));
                            itemsCache.set(listId, pending);
                        }
                        return pending;
                    }

                    for (const op of ops) {
                        try {
                            switch (op.type) {
                                case 'createItem': {
                                    const realId = await firstValueFrom(api.createItem(op.payload));
                                    if (store.currentListId() === op.listId) {
                                        patchState(store, {
                                            items: resolveCreatedItemId(store.items(), op.tempItemId, realId),
                                        });
                                        void persistCurrentList();
                                    }
                                    break;
                                }
                                case 'toggleItem': {
                                    const serverItems = await getItemsCached(op.listId);
                                    const serverItem = serverItems.find(i => i.id === op.itemId);

                                    if (!serverItem) {
                                        // Item no longer exists server-side — nothing to toggle.
                                        break;
                                    }

                                    if (serverItem.isChecked === op.desiredChecked) {
                                        // Already converged (e.g. another device made the same change).
                                        break;
                                    }

                                    if (serverItem.checkedAt && serverItem.checkedAt > op.createdAt) {
                                        // Someone else changed this item's checked state more recently
                                        // than our offline toggle — server wins. Pull the server's
                                        // value into local state instead of overwriting it.
                                        if (store.currentListId() === op.listId) {
                                            patchState(store, {
                                                items: store.items().map(i =>
                                                    i.id === op.itemId
                                                        ? { ...i, isChecked: serverItem.isChecked, checkedAt: serverItem.checkedAt }
                                                        : i,
                                                ),
                                            });
                                            void persistCurrentList();
                                        }
                                        break;
                                    }

                                    await firstValueFrom(api.toggleItem(op.itemId));
                                    break;
                                }
                                case 'deleteItem':
                                    try {
                                        await firstValueFrom(api.deleteItem(op.itemId));
                                    } catch (e: unknown) {
                                        if (isNetworkError(e)) throw e;
                                        // already gone server-side — nothing to do
                                    }
                                    break;
                                case 'sendMessage': {
                                    const realId = await firstValueFrom(api.createMessage(op.payload));
                                    if (store.currentListId() === op.listId) {
                                        patchState(store, {
                                            messages: resolveCreatedMessageId(store.messages(), op.tempMessageId, realId),
                                        });
                                        void persistCurrentList();
                                    }
                                    break;
                                }
                                case 'deleteMessage':
                                    try {
                                        await firstValueFrom(api.deleteMessage(op.messageId));
                                    } catch (e: unknown) {
                                        if (isNetworkError(e)) throw e;
                                    }
                                    break;
                            }
                            if (op.localId !== undefined) await storage.removePendingOp(op.localId);
                        } catch (e: unknown) {
                            if (isNetworkError(e)) break; // still offline — retry later
                            if (op.localId !== undefined) await storage.removePendingOp(op.localId).catch(() => { });
                        }
                    }
                } finally {
                    const remaining = await storage.getPendingOps().catch(() => []);
                    patchState(store, { pendingOpsCount: remaining.length });
                    flushing = false;
                }
            },

            _cacheImage: cacheImage,
            _persistCurrentList: persistCurrentList,
        };
    }),

    withHooks((store) => {
        const hub = inject(HubService);
        const haptics = inject(HapticsService);
        const push = inject(PushNotificationService);
        const deviceId = inject(DeviceIdService);
        const userId = inject(UserIdService);
        const foreground = inject(ForegroundService);
        const crypto = inject(CryptoService);
        const storage = inject(ListStorageService);

        /**
         * Determines whether an item/message was sent by this person, preferring the
         * stable `senderUserId` (which survives machine sync) and falling back to
         * `senderDeviceId` for legacy rows that predate `userId`.
         */
        function isOwnSender(senderUserId: string | null, senderDeviceId: string | null): boolean {
            if (senderUserId !== null) return senderUserId === userId.userId();
            return senderDeviceId === deviceId.deviceId;
        }

        return {
            async onInit() {

                await store.loadKnownLists();

                const lists = store.knownLists();

                if (lists.length > 0) {
                    try {
                        await hub.connect();
                        await Promise.all(lists.map((l) => hub.joinList(l.id)));
                        foreground.start();
                    } catch {
                        // Offline at startup — continue without a realtime connection.
                        // Event subscriptions below still get registered, and
                        // hub.reconnected$ / the 'online' listener will pick things
                        // back up once connectivity returns.
                    }
                }

                try {
                    await push.initialize(lists.map(l => l.id));
                } catch { }

                try {
                    await store.seedUnreadSummaries();
                } catch { }

                try {
                    const pending = await storage.getPendingOps();
                    patchState(store, { pendingOpsCount: pending.length });
                } catch { }

                hub.itemCreated$.subscribe((event) => {
                    if (event.ghostListId !== store.currentListId()) {
                        if (!isOwnSender(event.senderUserId, event.senderDeviceId)) {
                            store._incrementUnreadItems(event.ghostListId);
                        }
                        return;
                    }
                    if (store.items().some((i) => i.id === event.id)) return;
                    const newItem = {
                        id: event.id,
                        ghostListId: event.ghostListId,
                        encryptedPayload: event.encryptedPayload,
                        initializationVector: event.initializationVector,
                        isChecked: event.isChecked,
                        checkedAt: null,
                        createdAt: event.createdAt,
                        senderDeviceId: event.senderDeviceId,
                        senderUserId: event.senderUserId,
                    } satisfies GhostListItem;
                    patchState(store, { items: [...store.items(), newItem] });
                    void store._persistCurrentList();
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
                    void store._persistCurrentList();
                });

                hub.itemDeleted$.subscribe((itemId) => {
                    patchState(store, { items: store.items().filter((i) => i.id !== itemId) });
                    void store._persistCurrentList();
                    haptics.itemDeleted();
                });

                hub.messageReceived$.subscribe((event) => {
                    if (event.ghostListId !== store.currentListId()) {
                        if (!isOwnSender(event.senderUserId, event.senderDeviceId)) {
                            haptics.messageReceived();
                            store._incrementUnread(event.ghostListId);
                        }
                        return;
                    }
                    if (store.messages().some((m) => m.id === event.id)) return;
                    if (!isOwnSender(event.senderUserId, event.senderDeviceId)) haptics.messageReceived();
                    const newMessage = {
                        id: event.id,
                        ghostListId: event.ghostListId,
                        encryptedMessage: event.encryptedMessage,
                        messageInitializationVector: event.initializationVector,
                        encryptedSenderName: event.encryptedSenderName,
                        senderNameInitializationVector: event.senderNameInitializationVector,
                        replyToMessageId: event.replyToMessageId,
                        createdAt: event.createdAt,
                        senderDeviceId: event.senderDeviceId,
                        senderUserId: event.senderUserId,
                    } satisfies GhostChatMessage;
                    patchState(store, { messages: [...store.messages(), newMessage] });
                    void store._persistCurrentList();
                });

                hub.messageDeleted$.subscribe((messageId) => {
                    patchState(store, { messages: store.messages().filter((m) => m.id !== messageId) });
                    void store._persistCurrentList();
                });

                hub.imageShared$.subscribe(async (event: ImageSharedEvent) => {
                    const known = store.knownLists().find((l) => l.id === event.ghostListId);
                    if (!known) return;
                    try {
                        const dataUrl = await crypto.decrypt(event.encryptedImage, event.imageInitializationVector, known.encryptionKey);
                        store._cacheImage(event.messageId, dataUrl);
                    } catch { }
                });

                hub.readReceiptUpdated$.subscribe((event) => {
                    if (event.deviceId === deviceId.deviceId || !event.lastReadMessageAt) return;
                    const current = store.othersLastReadMessageAt()[event.ghostListId] ?? null;
                    if (current && current >= event.lastReadMessageAt) return;
                    patchState(store, {
                        othersLastReadMessageAt: { ...store.othersLastReadMessageAt(), [event.ghostListId]: event.lastReadMessageAt },
                    });
                });

                hub.ttlUpdated$.subscribe((newTtl) => {
                    const current = store.currentList();
                    if (current) patchState(store, { currentList: { ...current, ttl: newTtl } });
                    void store._persistCurrentList();
                });

                hub.listDeleted$.subscribe(async (listId) => {

                    await store.forgetList(listId);
                });

                hub.memberKicked$.subscribe(async ({ listId, deviceId: kickedDeviceId }) => {
                    if (kickedDeviceId === deviceId.deviceId) {
                        await store.forgetList(listId);
                    }
                });

                const rejoinAndFlush = async () => {
                    const known = store.knownLists();
                    if (known.length > 0) {
                        await Promise.all(known.map((l) => hub.joinList(l.id).catch(() => { })));
                    }
                    void store.flushPendingOps();
                    // Re-sync unread counts after being offline/disconnected — events
                    // missed while disconnected would otherwise leave the badges stale.
                    void store.seedUnreadSummaries();
                };

                hub.reconnected$.subscribe(() => void rejoinAndFlush());

                if (typeof window !== 'undefined') {
                    window.addEventListener('online', () => {
                        void (async () => {
                            try {
                                await hub.connect();
                            } catch { }
                            void rejoinAndFlush();
                        })();
                    });
                }
            },

            onDestroy() {
                hub.disconnect();
            },
        };
    }),
);
