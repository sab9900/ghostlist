import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KnownList, ListMember } from '../../core/models';
import { HapticsService } from '../../core/services/haptics.service';
import { SensitiveListsService } from '../../core/services/sensitive-lists.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { GhostMistComponent } from '../../shared/ghost-mist/ghost-mist.component';
import { AppStore } from '../../store/app.store';
import { CreateListDialogComponent } from './components/create-list-dialog/create-list-dialog.component';
import { ExportDialogComponent } from './components/export-dialog/export-dialog.component';
import { ImportDialogComponent } from './components/import-dialog/import-dialog.component';
import { ListCardComponent } from './components/list-card/list-card.component';
import { ListFilterDialogComponent } from './components/list-filter-dialog/list-filter-dialog.component';
import { ListsHeaderComponent } from './components/lists-header/lists-header.component';
import { MarkAllReadDialogComponent } from './components/mark-all-read-dialog/mark-all-read-dialog.component';
import { RevealDialogComponent } from './components/reveal-dialog/reveal-dialog.component';

@Component({
    selector: 'app-lists',
    imports: [
        TranslatePipe,
        GhostMistComponent,
        ListsHeaderComponent,
        ListCardComponent,
        CreateListDialogComponent,
        ImportDialogComponent,
        ExportDialogComponent,
        RevealDialogComponent,
        MarkAllReadDialogComponent,
        ListFilterDialogComponent,
    ],
    templateUrl: './lists.component.html',
    styleUrl: './lists.component.scss',
})
export class ListsComponent {
    protected readonly store = inject(AppStore);
    private readonly router = inject(Router);
    private readonly haptics = inject(HapticsService);
    protected readonly sensitiveLists = inject(SensitiveListsService);
    protected readonly prefs = inject(UserPreferencesService);

    protected readonly showCoffeeLink = !(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios');

    private readonly memberLists = signal<Record<string, ListMember[]>>({});
    private readonly memberFetchAttempted = new Set<string>();

    constructor() {
        effect(() => {
            if (!this.store.listsLoaded()) return;
            for (const list of this.store.knownLists()) {
                if (this.memberFetchAttempted.has(list.id)) continue;
                this.memberFetchAttempted.add(list.id);
                void this.loadMembers(list.id, list.encryptionKey);
            }
        });
    }

    private async loadMembers(listId: string, encryptionKey: string): Promise<void> {
        try {
            const members = await this.store.fetchMembersForList(listId, encryptionKey);
            this.memberLists.update(m => ({ ...m, [listId]: members }));
        } catch { }
    }

    protected membersFor(listId: string): ListMember[] {
        // Falls back to the store's cache (survives this component being
        // destroyed/recreated on navigation) so a remount paints avatars
        // immediately instead of blanking them out while they're re-fetched.
        return this.memberLists()[listId] ?? this.store.peekCachedMembers(listId);
    }

    protected readonly hasSensitiveLists = computed(() =>
        this.store.knownLists().some(l => l.isSensitive),
    );

    protected readonly searchQuery = signal('');
    protected readonly showFilterDialog = signal(false);

    /** Sensitive-filtered and sorted, but never narrowed by the search query — used by the export dialog. */
    protected readonly visibleLists = computed(() => {
        const all = this.store.knownLists();
        const visible = this.sensitiveLists.revealed() ? all : all.filter(l => !l.isSensitive);
        return this.sortLists(visible);
    });

    protected readonly lists = computed(() => {
        const query = this.searchQuery().trim().toLowerCase();
        const all = this.visibleLists();
        return query ? all.filter(l => l.name.toLowerCase().includes(query)) : all;
    });

    private sortLists(items: KnownList[]): KnownList[] {
        const sorted = [...items];
        if (this.prefs.listSortOrder() === 'recent') {
            sorted.sort((a, b) => this.activityTimestamp(b) - this.activityTimestamp(a));
        } else {
            sorted.sort((a, b) => a.name.localeCompare(b.name));
        }
        return sorted;
    }

    private activityTimestamp(list: KnownList): number {
        const raw = list.lastActivityAt ?? list.addedAt;
        const t = raw ? new Date(raw).getTime() : 0;
        return Number.isNaN(t) ? 0 : t;
    }

    protected readonly totalUnread = computed(() => this.store.totalUnread() + this.store.totalUnreadItems());
    protected readonly activeListId = computed(() => this.store.currentListId());

    private logoClickCount = 0;
    private logoClickTimer: ReturnType<typeof setTimeout> | null = null;

    onLogoClick(): void {
        this.logoClickCount++;
        if (this.logoClickTimer) clearTimeout(this.logoClickTimer);
        if (this.logoClickCount >= 3) {
            this.logoClickCount = 0;
            this.logoClickTimer = null;
            this.onTripleClickLogo();
            return;
        }
        this.logoClickTimer = setTimeout(() => { this.logoClickCount = 0; }, 600);
    }

    private onTripleClickLogo(): void {
        if (this.sensitiveLists.revealed()) { this.sensitiveLists.hide(); return; }
        if (!this.hasSensitiveLists()) return;
        this.showRevealDialog.set(true);
    }

    protected readonly showRevealDialog = signal(false);

    protected readonly showCreateDialog = signal(false);
    protected readonly creating = signal(false);
    protected readonly createError = signal<string | null>(null);

    protected readonly showImportDialog = signal(false);
    protected readonly showExportDialog = signal(false);
    protected readonly showMarkAllReadDialog = signal(false);
    protected readonly markingAllRead = signal(false);

    async openList(id: string): Promise<void> {
        this.haptics.listTap();
        await this.router.navigate(['/list', id]);
    }

    unreadFor(id: string): number {
        return (this.store.unreadCounts()[id] ?? 0) + (this.store.unreadItemCounts()[id] ?? 0);
    }

    openCreateDialog(): void {
        this.createError.set(null);
        this.showCreateDialog.set(true);
    }

    async createList(name: string): Promise<void> {
        if (this.creating()) return;
        this.createError.set(null);
        this.creating.set(true);
        try {
            const key = await this.store.generateKey();
            const id = await this.store.createList(key, name);
            this.showCreateDialog.set(false);
            await this.router.navigate(['/list', id]);
        } catch (e: unknown) {
            this.createError.set(e instanceof Error ? e.message : 'Could not create list. Please try again.');
        } finally {
            this.creating.set(false);
        }
    }

    async confirmMarkAllRead(): Promise<void> {
        if (this.markingAllRead()) return;
        this.markingAllRead.set(true);
        try {
            await this.store.markAllRead();
            this.showMarkAllReadDialog.set(false);
        } finally {
            this.markingAllRead.set(false);
        }
    }

    goToSettings(): void {
        void this.router.navigate(['/settings']);
    }

    goToAbout(): void {
        void this.router.navigate(['/about']);
    }
}
