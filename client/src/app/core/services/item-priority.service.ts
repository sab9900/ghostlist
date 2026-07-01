import { Injectable } from '@angular/core';
import { ItemSortOrder } from '../../features/list-detail/items-tab/items-tab.types';

@Injectable({ providedIn: 'root' })
export class ItemPriorityService {
    private sortKey(listId: string): string {
        return `gl_items_sort_${listId}`;
    }

    getItemSortOrder(listId: string): ItemSortOrder {
        return (localStorage.getItem(this.sortKey(listId)) as ItemSortOrder | null) ?? 'createdAt';
    }

    setItemSortOrder(listId: string, order: ItemSortOrder): void {
        localStorage.setItem(this.sortKey(listId), order);
    }
}
