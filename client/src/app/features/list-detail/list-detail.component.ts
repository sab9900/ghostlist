import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, from, map, of, switchMap, take } from 'rxjs';
import { HubService } from '../../api/hub.service';
import { LayoutService } from '../../core/services/layout.service';
import { TranslatePipe } from '@ngx-translate/core';
import { BadgeComponent } from '../../shared/badge/badge.component';
import { AppStore } from '../../store/app.store';
import { ChatTabComponent } from './chat-tab/chat-tab.component';
import { ItemsTabComponent } from './items-tab/items-tab.component';
import { SettingsTabComponent } from './settings-tab/settings-tab.component';

type Tab = 'items' | 'chat' | 'settings';

const PANE_WIDTH_KEY = 'gl_pane_width';
const PANE_MIN = 20;
const PANE_MAX = 70;
const PANE_DEFAULT = 40;

function loadPaneWidth(): number {
    try {
        const stored = localStorage.getItem(PANE_WIDTH_KEY);
        if (stored) {
            const n = parseFloat(stored);
            if (!isNaN(n)) return Math.min(PANE_MAX, Math.max(PANE_MIN, n));
        }
    } catch { }
    return PANE_DEFAULT;
}

@Component({
    selector: 'app-list-detail',
    imports: [BadgeComponent, ItemsTabComponent, ChatTabComponent, SettingsTabComponent, RouterOutlet, TranslatePipe],
    templateUrl: './list-detail.component.html',
    styleUrl: './list-detail.component.scss',
})
export class ListDetailComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    private readonly hub = inject(HubService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    protected readonly layout = inject(LayoutService);

    // Tracks the active child route ('items' | 'chat' | 'settings') on mobile/tablet.
    private readonly currentUrl = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map(() => this.router.url),
        ),
        { initialValue: this.router.url },
    );

    private readonly routeTab = computed<Tab | null>(() => {
        const url = this.currentUrl().split(/[?#]/)[0];
        if (url.endsWith('/chat')) return 'chat';
        if (url.endsWith('/items')) return 'items';
        if (url.endsWith('/settings')) return 'settings';
        return null;
    });

    protected readonly activeTab = computed<Tab>(() => this.routeTab() ?? 'items');

    protected readonly settingsOpen = signal(false);
    protected readonly drawerClosing = signal(false);

    protected readonly paneWidth = signal(loadPaneWidth());
    protected readonly paneResizing = signal(false);

    protected readonly listName = computed(() => {
        const id = this.store.currentListId();
        return this.store.knownLists().find(l => l.id === id)?.name ?? '';
    });

    protected readonly unreadItems = computed(() => {
        const id = this.store.currentListId();
        if (!id) return 0;
        const ts = this.store.itemsReadDivider()[id];
        const cutoff = ts ? new Date(ts).getTime() : 0;
        // Matches items-tab's `isNew` flag (applies to all items regardless of
        // checked state) so the tab badge and the "new" markers stay in sync.
        return this.store.items().filter(
            i => new Date(i.createdAt).getTime() > cutoff,
        ).length;
    });

    protected readonly unreadMessages = computed(() => {
        const id = this.store.currentListId();
        if (!id) return 0;
        const ts = this.store.messagesReadDivider()[id];
        const cutoff = ts ? new Date(ts).getTime() : 0;
        return this.store.messages().filter(
            m => new Date(m.createdAt).getTime() > cutoff,
        ).length;
    });

    constructor() {

        const listsLoaded$ = toObservable(this.store.listsLoaded).pipe(filter(v => v));

        this.route.paramMap.pipe(
            takeUntilDestroyed(),
            switchMap(params => {
                const id = params.get('id')!;
                return listsLoaded$.pipe(
                    take(1),
                    switchMap(() => {
                        const known = this.store.knownLists().find(l => l.id === id);
                        if (!known) {
                            this.router.navigate(['/']);
                            return of(null);
                        }
                        return from(
                            this.store.leaveCurrentList()
                                .then(() => this.store.joinList(id, known.encryptionKey))
                                .catch((err: unknown) => {
                                    console.error('[list-detail] joinList failed, redirecting home:', err);
                                    this.router.navigate(['/']);
                                })
                        );
                    }),
                );
            }),
        ).subscribe();

        this.hub.listDeleted$.pipe(
            takeUntilDestroyed(),
            filter(listId => listId === this.store.currentListId()),
        ).subscribe(() => this.router.navigate(['/']));

        // On mobile/tablet, items/chat/settings are routed child views. If we
        // land on the bare /list/:id (no tab segment), default into the items
        // tab. Desktop never gets a tab segment appended.
        effect(() => {
            if (this.layout.isDesktop()) return;
            if (this.routeTab() !== null) return;
            const url = this.currentUrl().split(/[?#]/)[0];
            const id = this.route.snapshot.paramMap.get('id');
            if (!id) return;
            if (url === `/list/${id}` || url === `/list/${id}/`) {
                void this.router.navigate(['/list', id, 'items'], { replaceUrl: true });
            }
        });
    }

    async ngOnDestroy(): Promise<void> {
        await this.store.leaveCurrentList();
    }

    setTab(tab: Tab): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id && this.routeTab() !== tab) {
            void this.router.navigate(['/list', id, tab]);
        }

        const currentId = this.store.currentListId();
        if (!currentId) return;
        if (tab === 'items') void this.store.markItemsRead(currentId);
        if (tab === 'chat') void this.store.markMessagesRead(currentId);
    }

    closeDrawer(): void {
        this.drawerClosing.set(true);
        setTimeout(() => {
            this.settingsOpen.set(false);
            this.drawerClosing.set(false);
        }, 220);
    }

    async goBack(): Promise<void> {
        await this.router.navigate(['/']);
    }

    onPaneResizeStart(startEvent: MouseEvent): void {
        startEvent.preventDefault();

        const containerWidth =
            (startEvent.currentTarget as HTMLElement).parentElement!.offsetWidth;

        const startX = startEvent.clientX;
        const startPct = this.paneWidth();

        this.paneResizing.set(true);

        const onMove = (e: MouseEvent) => {
            const deltaPct = ((e.clientX - startX) / containerWidth) * 100;
            const next = Math.min(PANE_MAX, Math.max(PANE_MIN, startPct + deltaPct));
            this.paneWidth.set(next);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.paneResizing.set(false);
            try {
                localStorage.setItem(PANE_WIDTH_KEY, String(this.paneWidth()));
            } catch { }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}
