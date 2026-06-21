import { patchState, WritableStateSource } from '@ngrx/signals';
import { ListSubTab } from '../../core/models';

export interface ActiveViewStoreSlice extends WritableStateSource<{ visibleListTabs: ListSubTab[] }> {
    currentListId: () => string | null;
    visibleListTabs: () => ListSubTab[];
}

export function createActiveViewMethods(store: ActiveViewStoreSlice) {
    return {
        setVisibleListTabs(tabs: ReadonlyArray<ListSubTab>): void {
            patchState(store, { visibleListTabs: [...tabs] });
        },

        isListTabVisible(listId: string, tab: ListSubTab): boolean {
            return store.currentListId() === listId && store.visibleListTabs().includes(tab);
        },
    };
}
