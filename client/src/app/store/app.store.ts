import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { HubService } from '../api/hub.service';
import {
    DeleteAfterDuration,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    KnownList,
    ReceiveQrPayload,
    ShareDelivery,
} from '../core/models';
import { CryptoService } from '../core/services/crypto.service';
import { HapticsService } from '../core/services/haptics.service';
import { ListStorageService } from '../core/services/list-storage.service';

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
    })),

    withMethods((store) => {
        const api = inject(ApiService);
        const hub = inject(HubService);
        const storage = inject(ListStorageService);
        const crypto = inject(CryptoService);

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

        async function loadKnownLists(): Promise<void> {
            const knownLists = await storage.getAll();
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

        const pendingReceives = new Map<string, CryptoKey>();

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

            const bundle = await crypto.wrapListKey(listKey, receiverPublicKeyB64);
            const delivery: ShareDelivery = {
                wrappedKey: bundle.wrappedKey,
                senderPublicKey: bundle.senderPublicKey,
                listId,
            };
            await firstValueFrom(api.deliverShare(sessionId, delivery));
        }

        async function claimSharedKey(sessionId: string, name: string): Promise<string> {
            const privateKey = pendingReceives.get(sessionId);
            if (!privateKey) throw new Error('No pending receive for this session. Call initReceive() first.');

            const delivery = await firstValueFrom(api.pollShare(sessionId));

            pendingReceives.delete(sessionId);

            const already = store.knownLists().find(l => l.id === delivery.listId);
            if (already) return already.id;

            const listKey = await crypto.unwrapListKey(delivery.wrappedKey, delivery.senderPublicKey, privateKey);

            const entry: KnownList = { id: delivery.listId, encryptionKey: listKey, name, addedAt: new Date().toISOString() };
            await persistAndTrack(entry);
            await hub.connect();
            await hub.joinList(delivery.listId);

            return delivery.listId;
        }

        function generateKey(): Promise<string> {
            return crypto.generateKey();
        }

        async function importFromLink(listId: string, encryptionKey: string, name: string): Promise<void> {
            const already = store.knownLists().find((l) => l.id === listId);
            if (already) return;
            const entry: KnownList = { id: listId, encryptionKey, name, addedAt: new Date().toISOString() };
            await persistAndTrack(entry);
            await hub.connect();
            await hub.joinList(listId);
        }

        return {
            loadKnownLists,
            generateKey,
            initReceive,
            shareToReceiver,
            claimSharedKey,
            importFromLink,

            async createList(encryptionKey: string, name: string): Promise<string> {
                patchState(store, { loading: true });
                try {
                    const id = await firstValueFrom(api.createList());
                    const entry: KnownList = { id, encryptionKey, name, addedAt: new Date().toISOString() };
                    await persistAndTrack(entry);
                    await hub.joinList(id);
                    return id;
                } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Failed to create list');
                    throw e;
                } finally {
                    patchState(store, { loading: false });
                }
            },

            async joinList(id: string, encryptionKey: string): Promise<void> {
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
                    await firstValueFrom(api.deleteList(id));
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

            async forgetList(id: string): Promise<void> {
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

        return {
            async onInit() {

                await store.loadKnownLists();

                if (store.knownLists().length > 0) {
                    await hub.connect();
                    await Promise.all(store.knownLists().map((l) => hub.joinList(l.id)));
                }

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
