import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { KnownList, ListMember } from '../../core/models';
import { DeviceIdService } from '../../core/services/device-id.service';

interface ReadReceiptsState {

    unreadCounts: Record<string, number>;

    unreadItemCounts: Record<string, number>;

    unreadMessageIds: Record<string, string[]>;

    unreadItemIds: Record<string, string[]>;

    othersLastReadMessageAt: Record<string, string | null>;

    /** Decrypted member list per list ID, used for read receipt display. */
    cachedMembers: Record<string, ListMember[]>;
}

const initialState: ReadReceiptsState = {
    unreadCounts: {},
    unreadItemCounts: {},
    unreadMessageIds: {},
    unreadItemIds: {},
    othersLastReadMessageAt: {},
    cachedMembers: {},
};

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

                _addUnreadMessage(listId: string, messageId: string): void {
                    const ids = store.unreadMessageIds()[listId] ?? [];
                    if (ids.includes(messageId)) return;
                    patchState(store, {
                        unreadMessageIds: { ...store.unreadMessageIds(), [listId]: [...ids, messageId] },
                        unreadCounts: { ...store.unreadCounts(), [listId]: (store.unreadCounts()[listId] ?? 0) + 1 },
                    });
                },

                _addUnreadItem(listId: string, itemId: string): void {
                    const ids = store.unreadItemIds()[listId] ?? [];
                    if (ids.includes(itemId)) return;
                    patchState(store, {
                        unreadItemIds: { ...store.unreadItemIds(), [listId]: [...ids, itemId] },
                        unreadItemCounts: { ...store.unreadItemCounts(), [listId]: (store.unreadItemCounts()[listId] ?? 0) + 1 },
                    });
                },

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

                async markAllRead(): Promise<void> {
                    const lists = store.knownLists();
                    const devId = deviceId.deviceId;

                    // Snapshot IDs before clearing
                    const toFlush = lists.map(l => ({
                        id: l.id,
                        msgIds: [...(store.unreadMessageIds()[l.id] ?? [])],
                        itemIds: [...(store.unreadItemIds()[l.id] ?? [])],
                    }));

                    // Clear state immediately
                    const clearedCounts: Record<string, number> = {};
                    const clearedIds: Record<string, string[]> = {};
                    for (const l of lists) {
                        clearedCounts[l.id] = 0;
                        clearedIds[l.id] = [];
                    }
                    patchState(store, {
                        unreadCounts: { ...store.unreadCounts(), ...clearedCounts },
                        unreadItemCounts: { ...store.unreadItemCounts(), ...clearedCounts },
                        unreadMessageIds: { ...store.unreadMessageIds(), ...clearedIds },
                        unreadItemIds: { ...store.unreadItemIds(), ...clearedIds },
                    });

                    // Flush to server for each list
                    await Promise.all(toFlush.map(async ({ id, msgIds, itemIds }) => {
                        try {
                            if (msgIds.length > 0) await firstValueFrom(api.markMessagesRead(id, devId, msgIds));
                            if (itemIds.length > 0) await firstValueFrom(api.markItemsRead(id, devId, itemIds));
                        } catch { }
                    }));
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
                        patchState(store, {
                            othersLastReadMessageAt: { ...store.othersLastReadMessageAt(), [id]: latest },
                            cachedMembers: { ...store.cachedMembers(), [id]: members },
                        });
                    } catch { }
                },

                /** Called by the SignalR handler when another member updates their read receipt. */
                _updateMemberReadAt(listId: string, memberDeviceId: string, readAt: string): void {
                    const members = store.cachedMembers()[listId];
                    if (!members) return;
                    const updated = members.map(m =>
                        m.deviceId === memberDeviceId
                            ? { ...m, lastReadMessageAt: readAt }
                            : m,
                    );
                    patchState(store, { cachedMembers: { ...store.cachedMembers(), [listId]: updated } });
                },

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
