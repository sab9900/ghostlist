import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { GhostListItem } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { AppStore } from '../../../store/app.store';

interface DecryptedItem {
    id: string;
    text: string;
    isChecked: boolean;
    checkedAt: string | null;
    createdAt: string;
    isNew: boolean;
}

@Component({
    selector: 'app-items-tab',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './items-tab.component.html',
    styleUrl: './items-tab.component.scss',
})
export class ItemsTabComponent {
    private readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    private readonly haptics = inject(HapticsService);

    protected readonly newItemText = signal('');
    protected readonly addingItem = signal(false);
    protected readonly decryptedItems = signal<DecryptedItem[]>([]);

    /** Ids of items created by this device during the current session — never shown as "new". */
    private readonly ownItemIds = new Set<string>();

    private readonly sortedItems = computed(() => {
        const createdAt = (item: DecryptedItem) => new Date(item.createdAt).getTime();
        return [...this.decryptedItems()].sort((a, b) => createdAt(b) - createdAt(a));
    });

    protected readonly activeItems = computed(() => this.sortedItems().filter(i => !i.isChecked));
    protected readonly checkedItems = computed(() => this.sortedItems().filter(i => i.isChecked));

    constructor() {

        effect(() => {
            void this.store.items();
            void this.decryptItems().then(() => {
                void this.store.markItemsRead();
            });
        });
    }

    private async decryptItems(): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;
        const listId = this.store.currentListId();
        const divider = listId ? this.store.itemsReadDivider()[listId] : null;
        const cutoff = divider ? new Date(divider).getTime() : 0;
        const items = await Promise.all(
            this.store.items().map(async (item: GhostListItem) => ({
                id: item.id,
                text: await this.crypto.decrypt(item.encryptedPayload, item.initializationVector, key),
                isChecked: item.isChecked,
                checkedAt: item.checkedAt,
                createdAt: item.createdAt,
                isNew: new Date(item.createdAt).getTime() > cutoff && !this.ownItemIds.has(item.id),
            })),
        );
        this.decryptedItems.set(items);
    }

    async addItem(): Promise<void> {
        const text = this.newItemText().trim();
        if (!text) return;
        this.addingItem.set(true);
        const idsBefore = new Set(this.store.items().map(i => i.id));
        try {
            await this.store.addItem(text);
            this.newItemText.set('');
            const added = this.store.items().find(i => !idsBefore.has(i.id));
            if (added) {
                this.ownItemIds.add(added.id);
                // The optimistic patchState(s) above already triggered decryptItems()
                // with the old ownItemIds, so the "new" dot may briefly show — re-run
                // it now that the id is marked as our own.
                void this.decryptItems();
            }
        } finally {
            this.addingItem.set(false);
        }
    }

    async toggleItem(id: string): Promise<void> {
        this.haptics.itemCheck();
        await this.store.toggleItem(id);
    }

    async deleteItem(id: string): Promise<void> {
        await this.store.deleteItem(id);
    }
}
