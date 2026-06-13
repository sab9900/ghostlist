import { computed, inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { KnownList, ListMember, ReadReceiptRequest } from '../../core/models';
import { DeviceIdService } from '../../core/services/device-id.service';

interface ReadReceiptsState {

    unreadCounts: Record<string, number>;

    unreadItemCounts: Record<string, number>;

    lastReadMessageAt: Record<string, string | null>;

    lastReadItemAt: Record<string, string | null>;

    messagesReadDivider: Record<string, string | null>;

    itemsReadDivider: Record<string, string | null>;

    othersLastReadMessageAt: Record<string, string | null>;
}

const initialState: ReadReceiptsState = {
    unreadCounts: {},
    unreadItemCounts: {},
    lastReadMessageAt: {},
    lastReadItemAt: {},
    messagesReadDivider: {},
    itemsReadDivider: {},
    othersLastReadMessageAt: {},
};

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

            async function pushReadReceipt(listId: string, receipt: ReadReceiptRequest): Promise<void> {
                try {
                    await firstValueFrom(api.updateReadReceipt(listId, deviceId.deviceId, receipt));
                } catch { }
            }

            return {
                _incrementUnread(listId: string): void {
                    const counts = { ...store.unreadCounts() };
                    counts[listId] = (counts[listId] ?? 0) + 1;
                    patchState(store, { unreadCounts: counts });
                },

                _incrementUnreadItems(listId: string): void {
                    const counts = { ...store.unreadItemCounts() };
                    counts[listId] = (counts[listId] ?? 0) + 1;
                    patchState(store, { unreadItemCounts: counts });
                },

                async markMessagesRead(listId?: string): Promise<void> {
                    const id = listId ?? store.currentListId();
                    if (!id) return;
                    const now = new Date().toISOString();
                    patchState(store, {
                        unreadCounts: { ...store.unreadCounts(), [id]: 0 },
                        lastReadMessageAt: { ...store.lastReadMessageAt(), [id]: now },
                    });
                    await pushReadReceipt(id, { lastReadMessageAt: now });
                },

                async markItemsRead(listId?: string): Promise<void> {
                    const id = listId ?? store.currentListId();
                    if (!id) return;
                    const now = new Date().toISOString();
                    patchState(store, {
                        unreadItemCounts: { ...store.unreadItemCounts(), [id]: 0 },
                        lastReadItemAt: { ...store.lastReadItemAt(), [id]: now },
                    });
                    await pushReadReceipt(id, { lastReadItemAt: now });
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
                    const lastReadMessageAt = { ...store.lastReadMessageAt() };
                    const lastReadItemAt = { ...store.lastReadItemAt() };
                    const messagesReadDivider = { ...store.messagesReadDivider() };
                    const itemsReadDivider = { ...store.itemsReadDivider() };
                    const currentListId = store.currentListId();

                    for (const r of results) {
                        if (!r) continue;
                        // The currently-open list's read state is actively maintained
                        // (markMessagesRead/markItemsRead + live SignalR events) and
                        // already reflects what the server has. Overwriting it here
                        // would reset the "new since last visit" divider while the
                        // user is still looking at it, so leave it untouched.
                        if (r.id === currentListId) continue;
                        unreadCounts[r.id] = r.summary.unreadMessageCount;
                        unreadItemCounts[r.id] = r.summary.unreadItemCount;
                        lastReadMessageAt[r.id] = r.summary.lastReadMessageAt;
                        lastReadItemAt[r.id] = r.summary.lastReadItemAt;
                        messagesReadDivider[r.id] = r.summary.lastReadMessageAt;
                        itemsReadDivider[r.id] = r.summary.lastReadItemAt;
                    }

                    patchState(store, { unreadCounts, unreadItemCounts, lastReadMessageAt, lastReadItemAt, messagesReadDivider, itemsReadDivider });
                },
            };
        }),
    );
}
