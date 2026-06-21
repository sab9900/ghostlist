import { inject } from '@angular/core';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { GhostChatMessage, GhostList, GhostListItem } from '../../core/models';
import { ListStorageService } from '../../core/services/list-storage.service';

export function withListPersistence() {
    return signalStoreFeature(
        type<{
            state: {
                currentListId: string | null;
                currentList: GhostList | null;
                items: GhostListItem[];
                messages: GhostChatMessage[];
            };
        }>(),

        withMethods((store) => {
            const storage = inject(ListStorageService);

            return {
                async _persistCurrentList(): Promise<void> {
                    const id = store.currentListId();
                    if (!id) return;
                    const list = store.currentList();
                    await storage.putListCache({
                        id,
                        ttl: list?.ttl ?? 0,
                        whisperLifetimeSeconds: list?.whisperLifetimeSeconds ?? 5,
                        createdAt: list?.createdAt ?? new Date().toISOString(),
                        items: store.items(),
                        messages: store.messages(),
                        cachedAt: new Date().toISOString(),
                    }).catch(() => { });
                },
            };
        }),
    );
}
