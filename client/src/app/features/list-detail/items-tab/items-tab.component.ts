import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { GhostListItem, ListMember } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
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
    creatorName: string | null;
    checkedByName: string | null;
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
    private readonly deviceId = inject(DeviceIdService);
    private readonly userId = inject(UserIdService);
    private readonly prefs = inject(UserPreferencesService);

    protected readonly newItemText = signal('');
    protected readonly addingItem = signal(false);
    protected readonly decryptedItems = signal<DecryptedItem[]>([]);
    private readonly members = signal<ListMember[]>([]);

    private readonly sortedItems = computed(() => {
        const createdAt = (item: DecryptedItem) => new Date(item.createdAt).getTime();
        return [...this.decryptedItems()].sort((a, b) => createdAt(b) - createdAt(a));
    });

    protected readonly activeItems = computed(() => this.sortedItems().filter(i => !i.isChecked));
    protected readonly checkedItems = computed(() => this.sortedItems().filter(i => i.isChecked));

    constructor() {

        effect(() => {
            const id = this.store.currentListId();
            untracked(() => this.loadMembers(id));
        });

        effect(() => {
            void this.store.items();
            void this.members();
            void this.decryptItems();
        });
    }

    private async loadMembers(listId: string | null): Promise<void> {
        this.members.set([]);
        if (!listId) return;
        const known = this.store.knownLists().find(l => l.id === listId);
        if (!known) return;
        try {
            const members = await this.store.fetchMembersForList(known.id, known.encryptionKey);
            this.members.set(members);
        } catch { }
    }

    /**
     * Whether an item/check action originated from this person, based on the
     * stable `senderUserId` (preferred) or `senderDeviceId` (legacy fallback).
     * Returns null if neither identifier is present.
     */
    private isMineBySenderIds(senderUserId: string | null, senderDeviceId: string | null): boolean | null {
        if (senderUserId !== null) return senderUserId === this.userId.userId();
        if (senderDeviceId !== null) return senderDeviceId === this.deviceId.deviceId;
        return null;
    }

    /** Resolves a display name for a sender/checker identified by userId/deviceId, or null if unknown. */
    private resolveName(userId: string | null, deviceId: string | null): string | null {
        if (userId === null && deviceId === null) return null;

        if (this.isMineBySenderIds(userId, deviceId)) {
            return this.prefs.senderName() || 'Anonymous';
        }

        const member = this.members().find(m =>
            (userId !== null && m.userId === userId) ||
            (deviceId !== null && m.deviceId === deviceId),
        );
        return member?.displayName || 'Anonymous';
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
                creatorName: this.resolveName(item.senderUserId, item.senderDeviceId),
                checkedByName: item.isChecked ? this.resolveName(item.checkedByUserId, item.checkedByDeviceId) : null,
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
