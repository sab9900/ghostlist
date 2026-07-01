import { Component, HostListener, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ApiService } from '../../../api/api.service';
import { HubService } from '../../../api/hub.service';
import { GhostListItem } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { IcalService } from '../../../core/services/ical.service';
import { ItemPriorityService } from '../../../core/services/item-priority.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AppStore } from '../../../store/app.store';
import { ItemAddBarComponent } from './components/item-add-bar/item-add-bar.component';
import { ItemFilterDialogComponent } from './components/item-filter-dialog/item-filter-dialog.component';
import { ItemRowComponent } from './components/item-row/item-row.component';
import { ReminderDialogComponent } from './components/reminder-dialog/reminder-dialog.component';
import { ActiveReminder, DecryptedItem, ItemPriority, ItemSortOrder } from './items-tab.types';

const SWIPE_TRIGGER_DISTANCE = 64;
const SWIPE_MAX_DISTANCE = 80;

@Component({
    selector: 'app-items-tab',
    imports: [TranslatePipe, ItemAddBarComponent, ItemRowComponent, ReminderDialogComponent, ItemFilterDialogComponent],
    templateUrl: './items-tab.component.html',
    styleUrl: './items-tab.component.scss',
})
export class ItemsTabComponent implements OnDestroy {
    private readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    private readonly haptics = inject(HapticsService);
    private readonly deviceId = inject(DeviceIdService);
    private readonly userId = inject(UserIdService);
    private readonly prefs = inject(UserPreferencesService);
    private readonly api = inject(ApiService);
    private readonly hub = inject(HubService);
    private readonly ical = inject(IcalService);
    private readonly route = inject(ActivatedRoute);
    private readonly itemPriority = inject(ItemPriorityService);

    protected readonly addingItem = signal(false);
    protected readonly decryptedItems = signal<DecryptedItem[]>([]);
    private readonly members = signal<{ userId: string | null; deviceId: string; displayName: string }[]>([]);

    protected readonly openMenuId = signal<string | null>(null);
    protected readonly menuAbove = signal(false);

    protected readonly swipeTriggerDistance = SWIPE_TRIGGER_DISTANCE;
    private swipeStartX = 0;
    private swipeStartY = 0;
    private swipeAxisLocked: 'x' | 'y' | null = null;
    protected readonly swipeState = signal<{ id: string; dx: number } | null>(null);

    protected readonly reminders = signal<Map<string, ActiveReminder>>(new Map());
    private readonly hubSub: Subscription;

    protected readonly highlightedItemId = signal<string | null>(null);
    private pendingHighlightId: string | null = null;
    private highlightApplied = false;
    private highlightClearTimer: ReturnType<typeof setTimeout> | null = null;

    protected readonly reminderItem = signal<DecryptedItem | null>(null);
    protected readonly savingReminder = signal(false);
    protected readonly reminderSaved = signal(false);
    private lastSavedRemindAt = '';
    private lastSavedItemId = '';

    protected readonly filterOpen = signal(false);
    protected readonly searchQuery = signal('');
    protected readonly itemSortOrder = signal<ItemSortOrder>('createdAt');

    protected readonly reminderMinDateTime = computed(() => {
        const d = new Date(Date.now() + 60_000);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });

    private readonly sortedItems = computed(() => {
        const order = this.itemSortOrder();
        const items = [...this.decryptedItems()];
        if (order === 'az') return items.sort((a, b) => a.text.localeCompare(b.text));
        if (order === 'za') return items.sort((a, b) => b.text.localeCompare(a.text));
        if (order === 'priority') {
            const rank = (p: ItemPriority | null) => p === 'important' ? 0 : p === 'optional' ? 2 : 1;
            return items.sort((a, b) => {
                const diff = rank(a.priority) - rank(b.priority);
                if (diff !== 0) return diff;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
        }
        return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    private readonly filteredItems = computed(() => {
        const q = this.searchQuery().trim().toLowerCase();
        if (!q) return this.sortedItems();
        return this.sortedItems().filter(i => i.text.toLowerCase().includes(q));
    });

    protected readonly activeItems = computed(() => this.filteredItems().filter(i => !i.isChecked));
    protected readonly checkedItems = computed(() => this.filteredItems().filter(i => i.isChecked));

    constructor() {
        effect(() => {
            const id = this.store.currentListId();
            untracked(() => {
                this.loadMembers(id);
                this.loadReminders(id);
                this.itemSortOrder.set(id ? this.itemPriority.getItemSortOrder(id) : 'createdAt');
            });
        });
        effect(() => {
            void this.store.items(); void this.members(); void this.store.unreadItemIds();
            void this.decryptItems();
        });
        this.hubSub = this.hub.reminderFired$.subscribe(event => {
            if (event.listId === this.store.currentListId()) this.loadReminders(event.listId);
        });
        this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
            const itemId = params.get('highlight');
            if (!itemId) return;
            this.pendingHighlightId = itemId;
            this.highlightApplied = false;
            this.highlightedItemId.set(itemId);
            this.tryApplyPendingHighlight();
        });
    }

    ngOnDestroy(): void {
        this.hubSub.unsubscribe();
        if (this.highlightClearTimer !== null) clearTimeout(this.highlightClearTimer);
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

    private loadReminders(listId: string | null, checkFired = false): void {
        if (!checkFired) this.reminders.set(new Map());
        if (!listId) return;
        this.api.getItemReminders(listId).subscribe({
            next: dtos => {
                const map = new Map<string, ActiveReminder>();
                for (const dto of dtos) map.set(dto.itemId, { id: dto.id, remindAt: dto.remindAt });
                this.reminders.set(map);
                if (checkFired && listId) {
                    const now = new Date();
                    for (const dto of dtos) {
                        if (new Date(dto.remindAt) <= now) {
                            void this.store.fireReminderSnack(listId, dto.itemId, dto.id);
                        }
                    }
                }
            },
            error: () => { },
        });
    }

    private applyHighlight(itemId: string): void {
        if (this.highlightClearTimer !== null) clearTimeout(this.highlightClearTimer);
        this.highlightedItemId.set(itemId);
        setTimeout(() => this.scrollToItem(itemId), 60);
        this.highlightClearTimer = setTimeout(() => {
            this.highlightedItemId.set(null);
            this.pendingHighlightId = null;
        }, 5000);
    }

    private scrollToItem(itemId: string): void {
        setTimeout(() => {
            const el = document.querySelector(`[data-item-id="${itemId}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    @HostListener('document:visibilitychange')
    onVisibilityChange(): void {
        if (document.visibilityState === 'visible') this.loadReminders(this.store.currentListId(), true);
    }

    protected reminderFor(itemId: string): ActiveReminder | undefined {
        return this.reminders().get(itemId);
    }

    private isMineBySenderIds(senderUserId: string | null, senderDeviceId: string | null): boolean | null {
        if (senderUserId !== null) return senderUserId === this.userId.userId();
        if (senderDeviceId !== null) return senderDeviceId === this.deviceId.deviceId;
        return null;
    }

    private resolveName(userId: string | null, deviceId: string | null): string | null {
        if (userId === null && deviceId === null) return null;
        if (this.isMineBySenderIds(userId, deviceId)) return this.prefs.senderName() || null;
        const member = this.members().find(m =>
            (userId !== null && m.userId === userId) || (deviceId !== null && m.deviceId === deviceId),
        );
        return member?.displayName || null;
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
                priority: this.numericToItemPriority(item.priority),
            })),
        );
        this.decryptedItems.set(items);
        this.tryApplyPendingHighlight();
    }

    private tryApplyPendingHighlight(): void {
        if (!this.pendingHighlightId || this.highlightApplied) return;
        if (!this.decryptedItems().some(i => i.id === this.pendingHighlightId)) return;
        this.highlightApplied = true;
        this.applyHighlight(this.pendingHighlightId);
    }

    onItemDwellRead(itemId: string): void { this.store.markItemRead(itemId); }

    async addItem(text: string): Promise<void> {
        this.addingItem.set(true);
        try { await this.store.addItem(text); }
        finally { this.addingItem.set(false); }
    }

    onItemClick(id: string): void {
        if (this.openMenuId()) { this.openMenuId.set(null); return; }
        void this.toggleItem(id);
    }

    async toggleItem(id: string): Promise<void> {
        this.haptics.itemCheck();
        await this.store.toggleItem(id);
        const item = this.decryptedItems().find(i => i.id === id);
        if (item?.isChecked) {
            const reminder = this.reminders().get(id);
            if (reminder) {
                this.api.deleteItemReminder(reminder.id).subscribe({ error: () => { } });
                const updated = new Map(this.reminders());
                updated.delete(id);
                this.reminders.set(updated);
            }
        }
    }

    async deleteItem(id: string): Promise<void> {
        this.openMenuId.set(null);
        await this.store.deleteItem(id);
    }

    toggleMenu(id: string, event: MouseEvent): void {
        event.stopPropagation();
        if (this.openMenuId() === id) { this.openMenuId.set(null); return; }
        const btn = event.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();
        const container = btn.closest('.item-list');
        const containerBottom = container ? container.getBoundingClientRect().bottom : window.innerHeight;
        this.menuAbove.set(containerBottom - rect.bottom < 120);
        this.openMenuId.set(id);
    }

    @HostListener('document:click')
    closeMenu(): void { this.openMenuId.set(null); }

    protected swipeOffset(id: string): number {
        const state = this.swipeState();
        return state?.id === id ? state.dx : 0;
    }

    onTouchStart(event: TouchEvent, id: string): void {
        if (event.touches.length !== 1) return;
        this.swipeStartX = event.touches[0].clientX;
        this.swipeStartY = event.touches[0].clientY;
        this.swipeAxisLocked = null;
        this.swipeState.set({ id, dx: 0 });
    }

    onTouchMove(event: TouchEvent, id: string): void {
        const state = this.swipeState();
        if (!state || state.id !== id) return;
        const dx = event.touches[0].clientX - this.swipeStartX;
        const dy = event.touches[0].clientY - this.swipeStartY;
        if (!this.swipeAxisLocked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            this.swipeAxisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (this.swipeAxisLocked !== 'x') return;
        const clamped = Math.max(-SWIPE_MAX_DISTANCE, Math.min(0, dx));
        if (clamped <= -SWIPE_TRIGGER_DISTANCE && state.dx > -SWIPE_TRIGGER_DISTANCE) this.haptics.listTap();
        this.swipeState.set({ id, dx: clamped });
        event.preventDefault();
    }

    onTouchEnd(id: string): void {
        const state = this.swipeState();
        this.swipeAxisLocked = null;
        if (state && state.id === id && state.dx <= -SWIPE_TRIGGER_DISTANCE) void this.deleteItem(id);
        this.swipeState.set(null);
    }

    openReminder(item: DecryptedItem): void {
        this.openMenuId.set(null);
        this.reminderSaved.set(false);
        this.reminderItem.set(item);
    }

    closeReminder(): void { this.reminderItem.set(null); this.reminderSaved.set(false); }

    downloadIcal(): void {
        const listId = this.store.currentListId();
        if (!listId || !this.lastSavedItemId || !this.lastSavedRemindAt) return;
        this.ical.download(listId, this.lastSavedItemId, this.lastSavedRemindAt);
        setTimeout(() => this.closeReminder(), 400);
    }

    async saveReminder(dateTime: string): Promise<void> {
        const item = this.reminderItem();
        const listId = this.store.currentListId();
        if (!item || !listId || !dateTime) return;
        const remindAt = new Date(dateTime).toISOString();
        this.savingReminder.set(true);
        try {
            const reminderId = await this.api.createItemReminder({ ghostListId: listId, itemId: item.id, remindAt }).toPromise();
            if (reminderId) {
                const updated = new Map(this.reminders());
                updated.set(item.id, { id: reminderId, remindAt });
                this.reminders.set(updated);
                this.lastSavedItemId = item.id;
                this.lastSavedRemindAt = remindAt;
            }
            this.reminderSaved.set(true);
        } catch {
        } finally { this.savingReminder.set(false); }
    }

    async cancelReminder(itemId: string): Promise<void> {
        this.openMenuId.set(null);
        const reminder = this.reminders().get(itemId);
        if (!reminder) return;
        try {
            await this.api.deleteItemReminder(reminder.id).toPromise();
            const updated = new Map(this.reminders());
            updated.delete(itemId);
            this.reminders.set(updated);
        } catch { }
    }

    private numericToItemPriority(value: number): ItemPriority | null {
        if (value === 1) return 'important';
        if (value === 2) return 'optional';
        return null;
    }

    private itemPriorityToNumeric(priority: ItemPriority | null): number {
        if (priority === 'important') return 1;
        if (priority === 'optional') return 2;
        return 0;
    }

    setItemPriority(itemId: string, priority: ItemPriority | null): void {
        this.openMenuId.set(null);
        void this.store.setItemPriority(itemId, this.itemPriorityToNumeric(priority));
    }

    onSortOrderChange(order: ItemSortOrder): void {
        this.itemSortOrder.set(order);
        const listId = this.store.currentListId();
        if (listId) this.itemPriority.setItemSortOrder(listId, order);
    }
}
