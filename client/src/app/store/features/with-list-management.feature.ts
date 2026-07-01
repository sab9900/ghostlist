import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { HubService } from '../../api/hub.service';
import {
    CharonDropDto,
    DeleteAfterDuration,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    KnownList,
    WhisperLifetime,
} from '../../core/models';
import { CryptoService } from '../../core/services/crypto.service';
import { DeviceIdService } from '../../core/services/device-id.service';
import { ForegroundService } from '../../core/services/foreground.service';
import { ListStorageService } from '../../core/services/list-storage.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { mergeRecentMessagesPage } from '../store-utils';

const RECENT_MESSAGES_DISPLAY_LIMIT = 50;

interface ManagedState {
    currentListId: string | null;
    currentEncryptionKey: string | null;
    currentList: GhostList | null;
    knownLists: KnownList[];
    items: GhostListItem[];
    messages: GhostChatMessage[];
    messagesHasMore: boolean;
    charonDrops: CharonDropDto[];
    audioDataUrls: Record<string, string>;
    loading: boolean;
    currentListSynced: boolean;
    error: string | null;
}

export interface ListManagementStoreSlice extends WritableStateSource<ManagedState> {
    currentListId: () => string | null;
    currentEncryptionKey: () => string | null;
    currentList: () => GhostList | null;
    knownLists: () => KnownList[];
    items: () => GhostListItem[];
    messages: () => GhostChatMessage[];
    messagesHasMore: () => boolean;
    charonDrops: () => CharonDropDto[];
    audioDataUrls: () => Record<string, string>;
    loading: () => boolean;
    currentListSynced: () => boolean;
    error: () => string | null;
    _persistAndTrack: (entry: KnownList) => Promise<void>;
    _registerAsMember: (listId: string, encryptionKey: string) => Promise<void>;
    _persistCurrentList: () => Promise<void>;
    ensureUnreadSeeded: (listId: string) => Promise<void>;
    refreshOthersReadReceipt: (listId?: string) => Promise<void>;
}

export function createListManagementMethods(store: ListManagementStoreSlice) {
    const api = inject(ApiService);
    const hub = inject(HubService);
    const storage = inject(ListStorageService);
    const crypto = inject(CryptoService);
    const push = inject(PushNotificationService);
    const deviceId = inject(DeviceIdService);
    const foreground = inject(ForegroundService);

    function setError(error: string | null): void {
        patchState(store, { error, loading: false });
    }

    const methods = {
        async createList(encryptionKey: string, name: string): Promise<string> {
            patchState(store, { loading: true });
            try {
                const tokenBytes = self.crypto.getRandomValues(new Uint8Array(32));
                const ownerToken = btoa(String.fromCharCode(...tokenBytes));
                const ownerTokenHash = await crypto.sha256Hex(ownerToken);

                const id = await firstValueFrom(api.createList(ownerTokenHash));
                const entry: KnownList = { id, encryptionKey, name, addedAt: new Date().toISOString(), ownerToken };
                await store._persistAndTrack(entry);

                void (async () => {
                    try {
                        await hub.connect();
                        await hub.joinList(id);
                        foreground.start();
                    } catch { }
                })();
                void push.subscribeToList(id).catch(() => { });
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
            const cachedMessages = (cached?.messages ?? []).map(m => ({ ...m, reactions: m.reactions ?? [] }));
            const initialMessages = cachedMessages.slice(-RECENT_MESSAGES_DISPLAY_LIMIT);
            const initialMessagesHasMore = cached?.hasMoreMessages ?? cachedMessages.length > initialMessages.length;

            patchState(store, {
                currentListId: id,
                currentEncryptionKey: encryptionKey,
                currentList: cached
                    ? {
                        id: cached.id,
                        ttl: cached.ttl,
                        whisperLifetimeSeconds: cached.whisperLifetimeSeconds,
                        createdAt: cached.createdAt,
                        items: cached.items,
                        chatMessages: initialMessages,
                        hasMoreMessages: initialMessagesHasMore,
                    }
                    : null,
                items: cached?.items ?? [],
                messages: initialMessages,
                messagesHasMore: initialMessagesHasMore,
                charonDrops: [],
                audioDataUrls: {},
                error: null,
                loading: !cached,
                currentListSynced: false,
            });

            try {
                await hub.connect();
                await hub.joinList(id);
                foreground.start();
            } catch (e: unknown) {
                if (store.currentListId() === id) patchState(store, { loading: false, currentListSynced: true });
                if (cached) return;
                setError(e instanceof Error ? e.message : 'Failed to open list');
                throw e;
            }

            try {
                const drops = await firstValueFrom(api.getCharonDrops(id));
                if (store.currentListId() === id) {
                    patchState(store, { charonDrops: drops });
                }
            } catch { }

            try {
                const list = await firstValueFrom(api.getList(id));

                if (store.currentListId() === id) {
                    patchState(store, {
                        currentList: list,
                        items: list.items,
                        messages: list.chatMessages,
                        messagesHasMore: list.hasMoreMessages,
                        loading: false,
                        currentListSynced: true,
                    });
                    void store._persistCurrentList();
                }

                await registration;
                await store.ensureUnreadSeeded(id);
                if (store.currentListId() === id) void store.refreshOthersReadReceipt(id);
            } catch (e: unknown) {
                if (store.currentListId() === id) patchState(store, { loading: false, currentListSynced: true });
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
                messagesHasMore: true,
                charonDrops: [],
                audioDataUrls: {},
                error: null,
                currentListSynced: false,
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
                    if (!(e instanceof HttpErrorResponse && e.status === 404)) throw e;
                }
                await hub.leaveList(id);
                await storage.remove(id);

                const isCurrentList = store.currentListId() === id;
                patchState(store, {
                    knownLists: store.knownLists().filter((l) => l.id !== id),
                    loading: false,
                    ...(isCurrentList ? {
                        currentListId: null,
                        currentEncryptionKey: null,
                        currentList: null,
                        items: [],
                        messages: [],
                        messagesHasMore: true,
                        charonDrops: [],
                        currentListSynced: false,
                    } : {}),
                });
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
                await methods.deleteList(id);
                return;
            }

            void firstValueFrom(api.deleteMember(id, deviceId.deviceId)).catch(() => { });
            await push.unsubscribeFromList(id);
            await hub.leaveList(id);
            await storage.remove(id);

            const isCurrentList = store.currentListId() === id;
            patchState(store, {
                knownLists: store.knownLists().filter((l) => l.id !== id),
                ...(isCurrentList ? {
                    currentListId: null,
                    currentEncryptionKey: null,
                    currentList: null,
                    items: [],
                    messages: [],
                    messagesHasMore: true,
                    charonDrops: [],
                    currentListSynced: false,
                } : {}),
            });
        },

        async kickMember(listId: string, targetDeviceId: string): Promise<void> {
            const ownerToken = store.knownLists().find(l => l.id === listId)?.ownerToken;
            if (!ownerToken) throw new Error('Not the list owner.');
            await firstValueFrom(api.kickMember(listId, targetDeviceId, ownerToken));
        },

        async removeOwnMemberMachine(listId: string, targetDeviceId: string): Promise<void> {
            await firstValueFrom(api.deleteMember(listId, targetDeviceId));
        },

        async updateTtl(ttl: DeleteAfterDuration): Promise<void> {
            const id = store.currentListId();
            if (!id) return;
            const ownerToken = store.knownLists().find(l => l.id === id)?.ownerToken;
            await firstValueFrom(api.updateTtl(id, ttl, ownerToken));
        },

        async updateWhisperLifetime(lifetime: WhisperLifetime): Promise<void> {
            const id = store.currentListId();
            if (!id) return;
            const ownerToken = store.knownLists().find(l => l.id === id)?.ownerToken;
            await firstValueFrom(api.updateWhisperLifetime(id, lifetime, ownerToken));
        },

        async refreshCurrentList(): Promise<void> {
            const id = store.currentListId();
            const key = store.currentEncryptionKey();
            if (!id || !key) return;

            try {
                const list = await firstValueFrom(api.getList(id));
                if (store.currentListId() === id) {
                    patchState(store, {
                        currentList: list,
                        items: list.items,
                        messages: mergeRecentMessagesPage(store.messages(), list.chatMessages),
                        messagesHasMore: list.hasMoreMessages,
                    });
                    void store._persistCurrentList();
                }
            } catch { }
        },
    };

    return methods;
}
