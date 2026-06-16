import { Component, computed, effect, HostListener, inject, OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { GhostListItem, ListMember } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { AppStore } from '../../../store/app.store';
import { ViewportDwellDirective } from '../../../core/directives/viewport-dwell.directive';
import { ApiService } from '../../../api/api.service';
import { HubService } from '../../../api/hub.service';
import { SwipeClampPipe } from './swipe-clamp.pipe';

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

interface ActiveReminder {
    id: string;
    remindAt: string; // ISO UTC
}

interface ReminderBanner {
    reminderId: string;
    itemId: string;
    itemText: string;
}

const SWIPE_TRIGGER_DISTANCE = 64;
const SWIPE_MAX_DISTANCE = 80;

@Component({
    selector: 'app-items-tab',
    imports: [FormsModule, TranslatePipe, ViewportDwellDirective, SwipeClampPipe],
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

    protected readonly newItemText = signal('');
    protected readonly addingItem = signal(false);
    protected readonly decryptedItems = signal<DecryptedItem[]>([]);
    private readonly members = signal<ListMember[]>([]);

    // ── context menu ──────────────────────────────────────────────────────
    protected readonly openMenuId = signal<string | null>(null);

    // ── swipe-to-delete ───────────────────────────────────────────────────
    readonly swipeTriggerDistance = SWIPE_TRIGGER_DISTANCE;
    private swipeStartX = 0;
    private swipeStartY = 0;
    private swipeAxisLocked: 'x' | 'y' | null = null;
    protected readonly swipeState = signal<{ id: string; dx: number } | null>(null);

    // ── reminders ─────────────────────────────────────────────────────────
    // itemId → { id: reminderId, remindAt: ISO }
    protected readonly reminders = signal<Map<string, ActiveReminder>>(new Map());

    // ── reminder banner ───────────────────────────────────────────────────
    protected readonly activeBanner = signal<ReminderBanner | null>(null);
    private readonly bannerQueue: ReminderBanner[] = [];
    // tracks which reminder IDs have already triggered a banner this session
    private readonly banneredIds = new Set<string>();
    private readonly hubSub: Subscription;

    // ── reminder dialog ───────────────────────────────────────────────────
    protected readonly reminderItem = signal<DecryptedItem | null>(null);
    protected reminderDate = '';
    protected reminderTime = '';
    protected readonly savingReminder = signal(false);
    protected readonly reminderSaved = signal(false);

    protected readonly reminderMinDate = computed(() => {
        const d = new Date();
        return d.toISOString().slice(0, 10);
    });

    // ── sorted lists ──────────────────────────────────────────────────────
    private readonly sortedItems = computed(() => {
        const createdAt = (item: DecryptedItem) => new Date(item.createdAt).getTime();
        return [...this.decryptedItems()].sort((a, b) => createdAt(b) - createdAt(a));
    });

    protected readonly activeItems = computed(() => this.sortedItems().filter(i => !i.isChecked));
    protected readonly checkedItems = computed(() => this.sortedItems().filter(i => i.isChecked));

    constructor() {
        effect(() => {
            const id = this.store.currentListId();
            untracked(() => {
                this.loadMembers(id);
                this.loadReminders(id);
            });
        });

        effect(() => {
            void this.store.items();
            void this.members();
            void this.decryptItems();
        });

        this.hubSub = this.hub.reminderFired$.subscribe(event => {
            // Reload map so badge reflects fired state
            const listId = this.store.currentListId();
            if (listId) this.loadReminders(listId);
            // Show in-app banner (deduplicated)
            if (!this.banneredIds.has(event.reminderId)) {
                this.banneredIds.add(event.reminderId);
                const item = this.decryptedItems().find(i => i.id === event.itemId);
                this.enqueueBanner({
                    reminderId: event.reminderId,
                    itemId: event.itemId,
                    itemText: item?.text ?? '…',
                });
            }
        });
    }

    ngOnDestroy(): void {
        this.hubSub.unsubscribe();
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
                for (const dto of dtos) {
                    map.set(dto.itemId, { id: dto.id, remindAt: dto.remindAt });
                }
                this.reminders.set(map);

                if (checkFired) {
                    // Show banners for any past-due reminders not yet shown
                    const now = new Date();
                    for (const dto of dtos) {
                        if (new Date(dto.remindAt) <= now && !this.banneredIds.has(dto.id)) {
                            this.banneredIds.add(dto.id);
                            const item = this.decryptedItems().find(i => i.id === dto.itemId);
                            this.enqueueBanner({
                                reminderId: dto.id,
                                itemId: dto.itemId,
                                itemText: item?.text ?? '…',
                            });
                        }
                    }
                }
            },
            error: () => { /* silently ignore */ },
        });
    }

    private enqueueBanner(banner: ReminderBanner): void {
        if (this.activeBanner()) {
            this.bannerQueue.push(banner);
        } else {
            this.haptics.reminderFired();
            this.activeBanner.set(banner);
        }
    }

    protected dismissBanner(scrollToItem = false): void {
        const banner = this.activeBanner();
        if (!banner) return;

        // ACK the reminder
        this.api.acknowledgeItemReminder(banner.reminderId).subscribe({
            error: () => { /* silently ignore */ },
        });

        // Remove from reminders map so badge disappears
        const updated = new Map(this.reminders());
        updated.delete(banner.itemId);
        this.reminders.set(updated);

        if (scrollToItem) {
            this.scrollToItem(banner.itemId);
        }

        this.activeBanner.set(null);

        // Show next queued banner after a short delay
        if (this.bannerQueue.length > 0) {
            setTimeout(() => {
                const next = this.bannerQueue.shift()!;
                this.haptics.reminderFired();
                this.activeBanner.set(next);
            }, 350);
        }
    }

    private scrollToItem(itemId: string): void {
        // Give the DOM a tick, then scroll the item into view
        setTimeout(() => {
            const el = document.querySelector(`[data-item-id="${itemId}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    @HostListener('document:visibilitychange')
    onVisibilityChange(): void {
        if (document.visibilityState === 'visible') {
            this.loadReminders(this.store.currentListId(), true);
        }
    }

    protected reminderFor(itemId: string): ActiveReminder | undefined {
        return this.reminders().get(itemId);
    }

    protected formatReminderDate(isoStr: string): string {
        const d = new Date(isoStr);
        const now = new Date();
        const startOfToday    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
        const startOfDayAfter = new Date(startOfTomorrow.getTime() + 86_400_000);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (d >= startOfToday    && d < startOfTomorrow) return timeStr;
        if (d >= startOfTomorrow && d < startOfDayAfter) return `+1d ${timeStr}`;
        return d.toLocaleDateString([], { day: 'numeric', month: 'numeric' }) + ' ' + timeStr;
    }

    private isMineBySenderIds(senderUserId: string | null, senderDeviceId: string | null): boolean | null {
        if (senderUserId !== null) return senderUserId === this.userId.userId();
        if (senderDeviceId !== null) return senderDeviceId === this.deviceId.deviceId;
        return null;
    }

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

    onItemClick(id: string, event: MouseEvent): void {
        if (this.openMenuId()) {
            this.openMenuId.set(null);
            return;
        }
        void this.toggleItem(id);
    }

    async toggleItem(id: string): Promise<void> {
        this.haptics.itemCheck();
        await this.store.toggleItem(id);

        // Auto-cancel reminder when item is checked off
        const item = this.decryptedItems().find(i => i.id === id);
        if (item?.isChecked) {
            const reminder = this.reminders().get(id);
            if (reminder) {
                this.api.deleteItemReminder(reminder.id).subscribe({ error: () => {} });
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

    // ── context menu ──────────────────────────────────────────────────────
    toggleMenu(id: string, event: Event): void {
        event.stopPropagation();
        this.openMenuId.set(this.openMenuId() === id ? null : id);
    }

    @HostListener('document:click')
    closeMenu(): void {
        this.openMenuId.set(null);
    }

    // ── swipe-to-delete ───────────────────────────────────────────────────
    swipeOffset(id: string): number {
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
        if (clamped <= -SWIPE_TRIGGER_DISTANCE && state.dx > -SWIPE_TRIGGER_DISTANCE) {
            this.haptics.listTap();
        }
        this.swipeState.set({ id, dx: clamped });
        event.preventDefault();
    }

    onTouchEnd(id: string): void {
        const state = this.swipeState();
        this.swipeAxisLocked = null;
        if (state && state.id === id && state.dx <= -SWIPE_TRIGGER_DISTANCE) {
            void this.deleteItem(id);
        }
        this.swipeState.set(null);
    }

    // ── reminder dialog ───────────────────────────────────────────────────
    openReminder(item: DecryptedItem): void {
        this.openMenuId.set(null);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        this.reminderDate = tomorrow.toISOString().slice(0, 10);
        this.reminderTime = '09:00';
        this.reminderSaved.set(false);
        this.reminderItem.set(item);
    }

    closeReminder(): void {
        this.reminderItem.set(null);
    }

    async saveReminder(): Promise<void> {
        const item = this.reminderItem();
        const listId = this.store.currentListId();
        if (!item || !listId || !this.reminderDate || !this.reminderTime) return;

        const remindAt = new Date(`${this.reminderDate}T${this.reminderTime}:00`).toISOString();

        this.savingReminder.set(true);
        try {
            const reminderId = await this.api.createItemReminder({
                ghostListId: listId,
                itemId: item.id,
                remindAt,
            }).toPromise();

            if (reminderId) {
                // update local map immediately — no reload needed
                const updated = new Map(this.reminders());
                updated.set(item.id, { id: reminderId, remindAt });
                this.reminders.set(updated);
            }

            this.reminderSaved.set(true);
            setTimeout(() => this.closeReminder(), 1200);
        } catch {
        } finally {
            this.savingReminder.set(false);
        }
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
}
