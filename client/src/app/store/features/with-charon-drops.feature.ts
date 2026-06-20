import { inject } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { CharonDropDto } from '../../core/models';

export interface CharonDropsStoreSlice extends WritableStateSource<{ charonDrops: CharonDropDto[] }> {
    currentListId: () => string | null;
    charonDrops: () => CharonDropDto[];
}

export function createCharonDropsMethods(store: CharonDropsStoreSlice) {
    const api = inject(ApiService);

    return {
        async sendCharonDrop(
            encryptedContent: string,
            contentInitializationVector: string,
            encryptedMetadata: string,
            metadataInitializationVector: string,
        ): Promise<void> {
            const listId = store.currentListId();
            if (!listId) return;

            await firstValueFrom(api.createCharonDrop({
                ghostListId: listId,
                encryptedContent,
                contentInitializationVector,
                encryptedMetadata,
                metadataInitializationVector,
            }));
        },

        async viewCharonDrop(dropId: string): Promise<void> {
            patchState(store, { charonDrops: store.charonDrops().filter(d => d.id !== dropId) });
            try {
                await firstValueFrom(api.markCharonDropViewed(dropId));
            } catch { }
        },

        async recallCharonDrop(dropId: string): Promise<void> {
            patchState(store, { charonDrops: store.charonDrops().filter(d => d.id !== dropId) });
            try {
                await firstValueFrom(api.deleteCharonDrop(dropId));
            } catch { }
        },
    };
}
