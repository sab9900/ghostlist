import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { GhostChatMessage, GhostListItem } from '../../core/models';
import { ListStorageService } from '../../core/services/list-storage.service';
import { isNetworkError, resolveCreatedItemId, resolveCreatedMessageId } from '../store-utils';

export function withOfflineQueue() {
    return signalStoreFeature(
        type<{
            state: {
                currentListId: string | null;
                pendingOpsCount: number;
                items: GhostListItem[];
                messages: GhostChatMessage[];
            };
            methods: {
                _persistCurrentList(): Promise<void>;
            };
        }>(),

        withMethods((store) => {
            const api = inject(ApiService);
            const storage = inject(ListStorageService);

            let flushing = false;

            async function enqueueOp(op: Parameters<ListStorageService['addPendingOp']>[0]): Promise<void> {
                await storage.addPendingOp(op);
                patchState(store, { pendingOpsCount: store.pendingOpsCount() + 1 });
            }

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

            return {
                _enqueueOp: enqueueOp,
                _upsertToggleOp: upsertToggleOp,

                async flushPendingOps(): Promise<void> {
                    if (flushing) return;
                    flushing = true;
                    try {
                        const ops = (await storage.getPendingOps().catch(() => []))
                            .slice()
                            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
                                            void store._persistCurrentList();
                                        }
                                        break;
                                    }
                                    case 'toggleItem': {
                                        const serverItems = await getItemsCached(op.listId);
                                        const serverItem = serverItems.find(i => i.id === op.itemId);

                                        if (!serverItem) break;
                                        if (serverItem.isChecked === op.desiredChecked) break;

                                        if (serverItem.checkedAt && serverItem.checkedAt > op.createdAt) {
                                            if (store.currentListId() === op.listId) {
                                                patchState(store, {
                                                    items: store.items().map(i =>
                                                        i.id === op.itemId
                                                            ? { ...i, isChecked: serverItem.isChecked, checkedAt: serverItem.checkedAt }
                                                            : i,
                                                    ),
                                                });
                                                void store._persistCurrentList();
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
                                        }
                                        break;
                                    case 'sendMessage': {
                                        const realId = await firstValueFrom(api.createMessage(op.payload));
                                        if (store.currentListId() === op.listId) {
                                            patchState(store, {
                                                messages: resolveCreatedMessageId(store.messages(), op.tempMessageId, realId),
                                            });
                                            void store._persistCurrentList();
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
                                if (isNetworkError(e)) break;
                                if (op.localId !== undefined) await storage.removePendingOp(op.localId).catch(() => { });
                            }
                        }
                    } finally {
                        const remaining = await storage.getPendingOps().catch(() => []);
                        patchState(store, { pendingOpsCount: remaining.length });
                        flushing = false;
                    }
                },
            };
        }),
    );
}
