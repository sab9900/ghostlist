import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { GhostListItem } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { AppStore } from '../../../store/app.store';
import { ViewportDwellDirective } from '../../../core/directives/viewport-dwell.directive';

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
    imports: [FormsModule, TranslatePipe, ViewportDwellDirective],
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

    private readonly sortedItems = computed(() => {
        const createdAt = (item: DecryptedItem) => new Date(item.createdAt).getTime();
        return [...this.decryptedItems()].sort((a, b) => createdAt(b) - createdAt(a));
    });

    protected readonly activeItems = computed(() => this.sortedItems().filter(i => !i.isChecked));
    protected readonly checkedItems = computed(() => this.sortedItems().filter(i => i.isChecked));

    constructor() {

        effect(() => {
            void this.store.items();
            void this.decryptItems();
        });
    }

    private async decryptItems(): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;
        const listId = this.store.currentListId();
        const unread = listId ? new Set(this.store.unreadItemIds()[listId] ?? []) : new Set<string>();
        const items = await Promise.all(
            this.store.items().map(async (item: GhostListItem) => ({
                id: item.id,
                text: await this.crypto.decrypt(item.encryptedPayload, item.initializationVector, key),
                isChecked: item.isChecked,
                checkedAt: item.checkedAt,
                createdAt: item.createdAt,
                isNew: unread.has(item.id),
            })),
        );
        this.decryptedItems.set(items);
    }

    /** Called once an item has been visible long enough to count as "read". */
    onItemDwellRead(itemId: string): void {
        this.store.markItemRead(itemId);
    }

    async addItem(): Promise<void> {
        const text = this.newItemText().trim();
        if (!text) return;
        this.addingItem.set(true);
        try {
            await this.store.addItem(text);
            this.newItemText.set('');
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
