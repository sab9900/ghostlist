import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { KnownList, ListMember } from '../../core/models';
import { DeviceIdService } from '../../core/services/device-id.service';

interface ReadReceiptsState {

    unreadCounts: Record<string, number>;

    unreadItemCounts: Record<string, number>;

    /** Ids of messages not yet seen by this device, per list. */
    unreadMessageIds: Record<string, string[]>;

    /** Ids of items not yet seen by this device, per list. */
    unreadItemIds: Record<string, string[]>;

    othersLastReadMessageAt: Record<string, string | null>;
}

const initialState: ReadReceiptsState = {
    unreadCounts: {},
    unreadItemCounts: {},
    unreadMessageIds: {},
    unreadItemIds: {},
    othersLastReadMessageAt: {},
};

/**
 * How long to wait after the first viewport-dwell "read" event before sending
 * the batched read-receipt request, so scrolling through several
 * messages/items at once results in one request instead of many.
 */
const FLUSH_DELAY_MS = 600;

export function withReadReceipts() {
    return signalStoreFeature(
        type<{
            state: {
                currentListId: string | null;
                currentEncryptionKey: string | null;
                knownLists: KnownList[];
            };
            methods: {
                fetchMembersForList(listId: string, encryptionKey: string): Promise<ListMember[]>;
            };
        }>(),

        withState(initialState),

        withComputed((store) => ({
            totalUnread: computed(() => Object.values(store.unreadCounts()).reduce((a, b) => a + b, 0)),
            totalUnreadItems: computed(() => Object.values(store.unreadItemCounts()).reduce((a, b) => a + b, 0)),
        })),

        withMethods((store) => {
            const api = inject(ApiService);
            const deviceId = inject(DeviceIdService);

            const pendingMessageIds: Record<string, Set<string>> = {};
            const pendingItemIds: Record<string, Set<string>> = {};
            const flushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

            async function flushMessages(listId: string): Promise<void> {
                const ids = pendingMessageIds[listId];
                if (!ids || ids.size === 0) return;
                const batch = [...ids];
                ids.clear();
                try {
                    await firstValueFrom(api.markMessagesRead(listId, deviceId.deviceId, batch));
                } catch { }
            }

            async function flushItems(listId: string): Promise<void> {
                const ids = pendingItemIds[listId];
                if (!ids || ids.size === 0) return;
                const batch = [...ids];
                ids.clear();
                try {
                    await firstValueFrom(api.markItemsRead(listId, deviceId.deviceId, batch));
                } catch { }
            }

            function scheduleFlush(listId: string, kind: 'messages' | 'items'): void {
                const key = `${kind}:${listId}`;
                if (flushTimers[key]) return;
                flushTimers[key] = setTimeout(() => {
                    delete flushTimers[key];
                    void (kind === 'messages' ? flushMessages(listId) : flushItems(listId));
                }, FLUSH_DELAY_MS);
            }

            return {
                /** Registers a newly-arrived message id as unread for `listId` (no-op if already tracked). */
                _addUnreadMessage(listId: string, messageId: string): void {
                    const ids = store.unreadMessageIds()[listId] ?? [];
                    if (ids.includes(messageId)) return;
                    patchState(store, {
                        unreadMessageIds: { ...store.unreadMessageIds(), [listId]: [...ids, messageId] },
                        unreadCounts: { ...store.unreadCounts(), [listId]: (store.unreadCounts()[listId] ?? 0) + 1 },
                    });
                },

                /** Registers a newly-arrived item id as unread for `listId` (no-op if already tracked). */
                _addUnreadItem(listId: string, itemId: string): void {
                    const ids = store.unreadItemIds()[listId] ?? [];
                    if (ids.includes(itemId)) return;
                    patchState(store, {
                        unreadItemIds: { ...store.unreadItemIds(), [listId]: [...ids, itemId] },
                        unreadItemCounts: { ...store.unreadItemCounts(), [listId]: (store.unreadItemCounts()[listId] ?? 0) + 1 },
                    });
                },

                /**
                 * Marks a single message as read once the user has actually had a
                 * chance to see it (called by the viewport-dwell directive).
                 * Updates local state immediately and batches the server-side
                 * receipt with other recently-read messages.
                 */
                markMessageRead(messageId: string, listId?: string): void {
                    const id = listId ?? store.currentListId();
                    if (!id) return;
                    const ids = store.unreadMessageIds()[id];
                    if (!ids || !ids.includes(messageId)) return;
                    patchState(store, {
                        unreadMessageIds: { ...store.unreadMessageIds(), [id]: ids.filter(i => i !== messageId) },
                        unreadCounts: { ...store.unreadCounts(), [id]: Math.max(0, (store.unreadCounts()[id] ?? 0) - 1) },
                    });
                    (pendingMessageIds[id] ??= new Set()).add(messageId);
                    scheduleFlush(id, 'messages');
                },

                /**
                 * Marks a single item as seen/read once the user has actually had a
                 * chance to see it (called by the viewport-dwell directive).
                 */
                markItemRead(itemId: string, listId?: string): void {
                    const id = listId ?? store.currentListId();
                    if (!id) return;
                    const ids = store.unreadItemIds()[id];
                    if (!ids || !ids.includes(itemId)) return;
                    patchState(store, {
                        unreadItemIds: { ...store.unreadItemIds(), [id]: ids.filter(i => i !== itemId) },
                        unreadItemCounts: { ...store.unreadItemCounts(), [id]: Math.max(0, (store.unreadItemCounts()[id] ?? 0) - 1) },
                    });
                    (pendingItemIds[id] ??= new Set()).add(itemId);
                    scheduleFlush(id, 'items');
                },

                async refreshOthersReadReceipt(listId?: string): Promise<void> {
                    const id = listId ?? store.currentListId();
                    const key = store.currentEncryptionKey();
                    if (!id || !key) return;
                    try {
                        const members = await store.fetchMembersForList(id, key);
                        let latest: string | null = null;
                        for (const m of members) {
                            if (m.isCurrentDevice || !m.lastReadMessageAt) continue;
                            if (!latest || m.lastReadMessageAt > latest) latest = m.lastReadMessageAt;
                        }
                        patchState(store, { othersLastReadMessageAt: { ...store.othersLastReadMessageAt(), [id]: latest } });
                    } catch { }
                },

                /**
                 * Fetches unread message/item ids for a single list and seeds local
                 * state from them, unless this list has already been seeded (e.g.
                 * by `seedUnreadSummaries()` at startup). Used when opening a list
                 * that wasn't covered by the last summary pass — e.g. one just
                 * created or joined during this session.
                 */
                async ensureUnreadSeeded(listId: string): Promise<void> {
                    if (store.unreadMessageIds()[listId] !== undefined) return;
                    try {
                        const summary = await firstValueFrom(api.getUnreadSummary(listId, deviceId.deviceId));
                        patchState(store, {
                            unreadCounts: { ...store.unreadCounts(), [listId]: summary.unreadMessageCount },
                            unreadItemCounts: { ...store.unreadItemCounts(), [listId]: summary.unreadItemCount },
                            unreadMessageIds: { ...store.unreadMessageIds(), [listId]: summary.unreadMessageIds },
                            unreadItemIds: { ...store.unreadItemIds(), [listId]: summary.unreadItemIds },
                        });
                    } catch { }
                },

                async seedUnreadSummaries(): Promise<void> {
                    const lists = store.knownLists();
                    if (lists.length === 0) return;

                    const results = await Promise.all(lists.map(async (l) => {
                        try {
                            return { id: l.id, summary: await firstValueFrom(api.getUnreadSummary(l.id, deviceId.deviceId)) };
                        } catch {
                            return null;
                        }
                    }));

                    const unreadCounts = { ...store.unreadCounts() };
                    const unreadItemCounts = { ...store.unreadItemCounts() };
                    const unreadMessageIds = { ...store.unreadMessageIds() };
                    const unreadItemIds = { ...store.unreadItemIds() };
                    const currentListId = store.currentListId();

                    for (const r of results) {
                        if (!r) continue;
                        // The currently-open list's read state is actively maintained
                        // via dwell-tracking + live SignalR events and already
                        // reflects what the server has. Overwriting it here would
                        // resurrect ids the user already read, so leave it untouched.
                        if (r.id === currentListId) continue;
                        unreadCounts[r.id] = r.summary.unreadMessageCount;
                        unreadItemCounts[r.id] = r.summary.unreadItemCount;
                        unreadMessageIds[r.id] = r.summary.unreadMessageIds;
                        unreadItemIds[r.id] = r.summary.unreadItemIds;
                    }

                    patchState(store, { unreadCounts, unreadItemCounts, unreadMessageIds, unreadItemIds });
                },
            };
        }),
    );
}
