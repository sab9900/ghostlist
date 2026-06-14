import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, from, map, of, switchMap, take } from 'rxjs';
import { HubService } from '../../api/hub.service';
import { ListMember } from '../../core/models';
import { LayoutService } from '../../core/services/layout.service';
import { TranslatePipe } from '@ngx-translate/core';
import { BadgeComponent } from '../../shared/badge/badge.component';
import { AppStore } from '../../store/app.store';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';
import { CharonTabComponent } from './charon-tab/charon-tab.component';
import { ChatTabComponent } from './chat-tab/chat-tab.component';
import { ItemsTabComponent } from './items-tab/items-tab.component';
import { SettingsTabComponent } from './settings-tab/settings-tab.component';
import { WhisperTabComponent } from './whisper-tab/whisper-tab.component';

type Tab = 'items' | 'chat' | 'whisper' | 'charon' | 'settings';

// Which view is shown in the desktop chat pane (a Chat/Whisper/Charon toggle, not a route).
type DesktopChatView = 'chat' | 'whisper' | 'charon';

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
    imports: [BadgeComponent, ItemsTabComponent, ChatTabComponent, WhisperTabComponent, CharonTabComponent, SettingsTabComponent, RouterOutlet, TranslatePipe, SwipeBackDirective],
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
        if (url.endsWith('/whisper')) return 'whisper';
        if (url.endsWith('/charon')) return 'charon';
        if (url.endsWith('/items')) return 'items';
        if (url.endsWith('/settings')) return 'settings';
        return null;
    });

    protected readonly activeTab = computed<Tab>(() => this.routeTab() ?? 'items');

    protected readonly settingsOpen = signal(false);
    protected readonly drawerClosing = signal(false);

    // Desktop only: toggles the chat pane between Chat and Whisper.
    protected readonly desktopChatView = signal<DesktopChatView>('chat');

    protected readonly paneWidth = signal(loadPaneWidth());
    protected readonly paneResizing = signal(false);

    protected readonly listName = computed(() => {
        const id = this.store.currentListId();
        return this.store.knownLists().find(l => l.id === id)?.name ?? '';
    });

    protected readonly unreadItems = computed(() => {
        const id = this.store.currentListId();
        if (!id) return 0;
        return this.store.unreadItemCounts()[id] ?? 0;
    });

    protected readonly unreadMessages = computed(() => {
        const id = this.store.currentListId();
        if (!id) return 0;
        return this.store.unreadCounts()[id] ?? 0;
    });

    protected readonly pendingCharonDrops = computed(() => this.store.charonDrops().length);

    // Chat, Lethe and Charon only make sense once someone else has joined the
    // list. Until members are loaded, default to false so these tabs don't
    // flash visible-then-hidden on solo lists.
    private readonly members = signal<ListMember[]>([]);
    protected readonly isMultiMember = computed(() => this.members().length > 1);

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

        // Load the member list whenever the active list (or its key) changes,
        // so we can tell whether Chat/Lethe/Charon are meaningful yet.
        effect(() => {
            const id = this.store.currentListId();
            const key = this.store.currentEncryptionKey();
            if (!id || !key) {
                this.members.set([]);
                return;
            }
            void this.store.fetchMembersForList(id, key)
                .then(members => {
                    if (this.store.currentListId() === id) this.members.set(members);
                })
                .catch(() => { });
        });

        // A member leaving/being kicked can turn a shared list back into a
        // solo one — refresh so the tabs hide again.
        this.hub.memberKicked$.pipe(
            takeUntilDestroyed(),
            filter(({ listId }) => listId === this.store.currentListId()),
        ).subscribe(() => {
            const id = this.store.currentListId();
            const key = this.store.currentEncryptionKey();
            if (!id || !key) return;
            void this.store.fetchMembersForList(id, key)
                .then(members => {
                    if (this.store.currentListId() === id) this.members.set(members);
                })
                .catch(() => { });
        });

        // On mobile/tablet, items/chat are routed child views. If we land on
        // the bare /list/:id (no tab segment), default into the items tab.
        // Desktop never gets a tab segment appended.
        effect(() => {
            if (this.layout.isDesktop()) return;
            const tab = this.routeTab();
            const id = this.route.snapshot.paramMap.get('id');
            if (!id) return;
            if (tab === null) {
                const url = this.currentUrl().split(/[?#]/)[0];
                if (url === `/list/${id}` || url === `/list/${id}/`) {
                    void this.router.navigate(['/list', id, 'items'], { replaceUrl: true });
                }
                return;
            }
            // Settings is no longer a tab on mobile; deep links open the
            // settings drawer instead and fall back to the items tab.
            if (tab === 'settings') {
                this.settingsOpen.set(true);
                void this.router.navigate(['/list', id, 'items'], { replaceUrl: true });
            }
            // Chat/Lethe/Charon are meaningless on a solo list — bounce back
            // to items if we land here (or stay) without other members.
            if ((tab === 'chat' || tab === 'whisper' || tab === 'charon') && !this.isMultiMember()) {
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
