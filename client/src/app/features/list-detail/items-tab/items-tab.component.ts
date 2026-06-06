import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GhostListItem } from '../../../core/models';
import { HapticsService } from '../../../core/services/haptics.service';
import { CryptoService } from '../../../core/services/crypto.service';
import { SeenService } from '../../../core/services/seen.service';
import { AppStore } from '../../../store/app.store';

interface DecryptedItem {
    id: string;
    text: string;
    isChecked: boolean;
    checkedAt: string | null;
    createdAt: string;
}

@Component({
    selector: 'app-items-tab',
    imports: [FormsModule],
    templateUrl: './items-tab.component.html',
    styleUrl: './items-tab.component.scss',
})
export class ItemsTabComponent {
    private readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    private readonly seen = inject(SeenService);
    private readonly haptics = inject(HapticsService);

    protected readonly newItemText = signal('');
    protected readonly addingItem = signal(false);
    protected readonly decryptedItems = signal<DecryptedItem[]>([]);

    protected readonly activeItems = computed(() => this.decryptedItems().filter(i => !i.isChecked));
    protected readonly checkedItems = computed(() => this.decryptedItems().filter(i => i.isChecked));

    constructor() {

        effect(() => {
            void this.store.items();
            void this.decryptItems().then(() => {
                const id = this.store.currentListId();
                if (id) this.seen.markItemsSeen(id);
            });
        });
    }

    private async decryptItems(): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;
        const items = await Promise.all(
            this.store.items().map(async (item: GhostListItem) => ({
                id: item.id,
                text: await this.crypto.decrypt(item.encryptedPayload, item.initializationVector, key),
                isChecked: item.isChecked,
                checkedAt: item.checkedAt,
                createdAt: item.createdAt,
            })),
        );
        this.decryptedItems.set(items);
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
