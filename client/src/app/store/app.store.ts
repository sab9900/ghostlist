import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { HubService } from '../api/hub.service';
import {
    AudioSharedEvent,
    CharonDropDto,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    ImageSharedEvent,
    KnownList,
} from '../core/models';
import { ConnectivityService } from '../core/services/connectivity.service';
import { CryptoService } from '../core/services/crypto.service';
import { DeviceIdService } from '../core/services/device-id.service';
import { ForegroundService } from '../core/services/foreground.service';
import { HapticsService } from '../core/services/haptics.service';
import { ListStorageService } from '../core/services/list-storage.service';
import { PushNotificationService } from '../core/services/push-notification.service';
import { UserIdService } from '../core/services/user-id.service';
import { dataUrlToBlob } from '../core/utils/audio-blob.util';
import { createCharonDropsMethods } from './features/with-charon-drops.feature';
import { createItemsMethods } from './features/with-items.feature';
import { createListManagementMethods } from './features/with-list-management.feature';
import { withListSync } from './features/with-list-sync.feature';
import { createMediaMethods } from './features/with-media.feature';
import { createMessagesMethods } from './features/with-messages.feature';

interface AppState {
    knownLists: KnownList[];
    currentListId: string | null;
    currentEncryptionKey: string | null;
    currentList: GhostList | null;
    items: GhostListItem[];
    messages: GhostChatMessage[];
    charonDrops: CharonDropDto[];
    imageDataUrls: Record<string, string>;
    audioDataUrls: Record<string, string>;
    listsLoaded: boolean;
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
    charonDrops: [],
    imageDataUrls: {},
    audioDataUrls: {},
    listsLoaded: false,
    pendingOpsCount: 0,
    loading: false,
    error: null,
};

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

    withMethods((store) => ({
        ...createItemsMethods(store),
        ...createMessagesMethods(store),
        ...createMediaMethods(store),
        ...createCharonDropsMethods(store),
        ...createListManagementMethods(store),
    })),

    withHooks((store) => {
        const hub = inject(HubService);
        const haptics = inject(HapticsService);
        const push = inject(PushNotificationService);
        const deviceId = inject(DeviceIdService);
        const userId = inject(UserIdService);
        const foreground = inject(ForegroundService);
        const crypto = inject(CryptoService);
        const storage = inject(ListStorageService);

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
                    } catch { }
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
                            store._addUnreadItem(event.ghostListId, event.id);
                        }
                        return;
                    }
                    if (store.items().some((i) => i.id === event.id)) return;

                    if (!isOwnSender(event.senderUserId, event.senderDeviceId)) {
                        store._addUnreadItem(event.ghostListId, event.id);
                    }

                    if (isOwnSender(event.senderUserId, event.senderDeviceId)) {
                        const optimisticMatch = store.items().find((i) =>
                            i.id.startsWith('local-') &&
                            i.encryptedPayload === event.encryptedPayload &&
                            i.initializationVector === event.initializationVector,
                        );
                        if (optimisticMatch) {
                            patchState(store, {
                                items: store.items().map((i) =>
                                    i.id === optimisticMatch.id ? { ...i, id: event.id, createdAt: event.createdAt } : i,
                                ),
                            });
                            void store._persistCurrentList();
                            return;
                        }
                    }

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
                        checkedByDeviceId: null,
                        checkedByUserId: null,
                    } satisfies GhostListItem;
                    patchState(store, { items: [...store.items(), newItem] });
                    void store._persistCurrentList();
                    haptics.itemAdded();
                });

                hub.itemToggled$.subscribe((event) => {
                    patchState(store, {
                        items: store.items().map((i) =>
                            i.id === event.itemId
                                ? {
                                    ...i,
                                    isChecked: event.isChecked,
                                    checkedAt: event.checkedAt,
                                    checkedByDeviceId: event.checkedByDeviceId,
                                    checkedByUserId: event.checkedByUserId,
                                }
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
                            store._addUnreadMessage(event.ghostListId, event.id);
                        }
                        return;
                    }
                    if (store.messages().some((m) => m.id === event.id)) return;
                    if (!isOwnSender(event.senderUserId, event.senderDeviceId)) {
                        haptics.messageReceived();
                        store._addUnreadMessage(event.ghostListId, event.id);
                    }

                    if (isOwnSender(event.senderUserId, event.senderDeviceId)) {
                        const optimisticMatch = store.messages().find((m) =>
                            m.id.startsWith('local-') &&
                            m.encryptedMessage === event.encryptedMessage &&
                            m.messageInitializationVector === event.initializationVector,
                        );
                        if (optimisticMatch) {
                            patchState(store, {
                                messages: store.messages().map((m) =>
                                    m.id === optimisticMatch.id ? { ...m, id: event.id, createdAt: event.createdAt } : m,
                                ),
                            });
                            void store._persistCurrentList();
                            return;
                        }
                    }

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

                hub.audioShared$.subscribe(async (event: AudioSharedEvent) => {
                    const known = store.knownLists().find((l) => l.id === event.ghostListId);
                    if (!known) return;
                    try {
                        const dataUrl = await crypto.decrypt(event.encryptedAudio, event.audioInitializationVector, known.encryptionKey);
                        const blob = dataUrlToBlob(dataUrl);
                        store._cacheAudio(event.messageId, URL.createObjectURL(blob));
                    } catch { }
                });

                hub.readReceiptUpdated$.subscribe((event) => {
                    if (event.deviceId === deviceId.deviceId || !event.lastReadMessageAt) return;
                    const current = store.othersLastReadMessageAt()[event.ghostListId] ?? null;
                    if (!current || current < event.lastReadMessageAt) {
                        patchState(store, {
                            othersLastReadMessageAt: { ...store.othersLastReadMessageAt(), [event.ghostListId]: event.lastReadMessageAt },
                        });
                    }
                    store._updateMemberReadAt(event.ghostListId, event.deviceId, event.lastReadMessageAt);
                });

                hub.charonDropCreated$.subscribe((event) => {
                    if (event.ghostListId !== store.currentListId()) return;
                    if (store.charonDrops().some((d) => d.id === event.id)) return;

                    const newDrop = {
                        id: event.id,
                        ghostListId: event.ghostListId,
                        encryptedContent: event.encryptedContent,
                        contentInitializationVector: event.contentInitializationVector,
                        encryptedMetadata: event.encryptedMetadata,
                        metadataInitializationVector: event.metadataInitializationVector,
                        createdAt: event.createdAt,
                        senderDeviceId: event.senderDeviceId,
                        senderUserId: event.senderUserId,
                    } satisfies CharonDropDto;
                    patchState(store, { charonDrops: [...store.charonDrops(), newDrop] });
                    if (!isOwnSender(event.senderUserId, event.senderDeviceId)) {
                        haptics.itemAdded();
                    }
                });

                hub.charonDropDeleted$.subscribe((dropId) => {
                    patchState(store, { charonDrops: store.charonDrops().filter((d) => d.id !== dropId) });
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
                    await store.flushAllPendingReads();
                    void store.seedUnreadSummaries();
                    if (store.currentListId()) void store.refreshCurrentList();
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
