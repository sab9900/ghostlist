import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideSettings } from "@lucide/angular";
import { TranslatePipe } from '@ngx-translate/core';
import { filter, from, map, of, switchMap, take } from 'rxjs';
import { HubService } from '../../api/hub.service';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';
import { TabTransitionDirective } from '../../core/directives/tab-transition.directive';
import { ListMember, ListSubTab } from '../../core/models';
import { LayoutService } from '../../core/services/layout.service';
import { PrefsCacheService } from '../../core/services/prefs-cache.service';
import { BadgeComponent } from '../../shared/badge/badge.component';
import { AppStore } from '../../store/app.store';
import { CharonTabComponent } from './charon-tab/charon-tab.component';
import { ChatTabComponent } from './chat-tab/chat-tab.component';
import { ItemsTabComponent } from './items-tab/items-tab.component';
import { SettingsTabComponent } from './settings-tab/settings-tab.component';
import { WhisperTabComponent } from './whisper-tab/whisper-tab.component';

type Tab = 'items' | 'chat' | 'whisper' | 'charon' | 'settings';

type DesktopChatView = 'chat' | 'whisper' | 'charon';

const PANE_WIDTH_KEY = 'gl_pane_width';
const PANE_MIN = 20;
const PANE_MAX = 70;
const PANE_DEFAULT = 40;

// Reads synchronously from PrefsCacheService's in-memory cache rather than
// IndexedDB directly: by the time any routed component like this one is
// constructed, the app has long since bootstrapped, and the cache's
// warm-up app initializer has resolved (see app.config.ts) — so the value
// is already available without an async round-trip.
function loadPaneWidth(prefsCache: PrefsCacheService): number {
    const stored = prefsCache.get<number | null>(PANE_WIDTH_KEY, null);
    if (stored !== null && !isNaN(stored)) {
        return Math.min(PANE_MAX, Math.max(PANE_MIN, stored));
    }
    return PANE_DEFAULT;
}

@Component({
    selector: 'app-list-detail',
    imports: [
        BadgeComponent,
        ItemsTabComponent,
        ChatTabComponent,
        WhisperTabComponent,
        CharonTabComponent,
        SettingsTabComponent,
        RouterOutlet, TranslatePipe, SwipeBackDirective, TabTransitionDirective, LucideSettings],
    templateUrl: './list-detail.component.html',
    styleUrl: './list-detail.component.scss',
})
export class ListDetailComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    private readonly hub = inject(HubService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    protected readonly layout = inject(LayoutService);
    private readonly prefsCache = inject(PrefsCacheService);

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

    protected readonly desktopChatView = signal<DesktopChatView>('chat');

    protected readonly paneWidth = signal(loadPaneWidth(this.prefsCache));
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

    private readonly members = signal<ListMember[]>([]);
    private readonly membersLoaded = signal(false);
    protected readonly isMultiMember = computed(() => {
        const keys = new Set(this.members().map(m => m.userId ? `user:${m.userId}` : `device:${m.deviceId}`));
        return keys.size > 1;
    });

    private readonly visibleListTabs = computed<ListSubTab[]>(() => {
        if (this.layout.isDesktop()) {
            const tabs: ListSubTab[] = ['items'];
            if (this.isMultiMember()) tabs.push(this.desktopChatView());
            return tabs;
        }
        const tab = this.routeTab();
        return tab === null || tab === 'settings' ? ['items'] : [tab];
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

        effect(() => {
            const id = this.store.currentListId();
            const key = this.store.currentEncryptionKey();
            if (!id || !key) {
                this.members.set([]);
                this.membersLoaded.set(false);
                return;
            }
            this.members.set(this.store.peekCachedMembers(id));
            this.refreshMembers();
        });

        this.hub.memberKicked$.pipe(
            takeUntilDestroyed(),
            filter(({ listId }) => listId === this.store.currentListId()),
        ).subscribe(() => this.refreshMembers());

        this.hub.memberJoined$.pipe(
            takeUntilDestroyed(),
            filter(({ listId }) => listId === this.store.currentListId()),
        ).subscribe(() => this.refreshMembers());

        effect(() => this.store.setVisibleListTabs(this.visibleListTabs()));

        effect(() => {
            if (this.layout.isDesktop()) return;
            const tab = this.routeTab();
            const id = this.route.snapshot.paramMap.get('id');
            if (!id) return;
            if (tab === null) {
                const url = this.currentUrl().split(/[?#]/)[0];
                if (url === `/list/${id}` || url === `/list/${id}/`) {
                    void this.router.navigate(['/list', id, this.defaultTabFor(id)], { replaceUrl: true });
                }
                return;
            }

            if (tab === 'settings') {
                this.settingsOpen.set(true);
                void this.router.navigate(['/list', id, 'items'], { replaceUrl: true });
            }

            if ((tab === 'chat' || tab === 'whisper' || tab === 'charon') && this.membersLoaded() && !this.isMultiMember()) {
                void this.router.navigate(['/list', id, 'items'], { replaceUrl: true });
            }
        });
    }

    /** Lands on the first tab (in display order) that has unread news for the given list, falling back to items. */
    private defaultTabFor(id: string): Tab {
        if ((this.store.unreadItemCounts()[id] ?? 0) > 0) return 'items';
        if ((this.store.unreadCounts()[id] ?? 0) > 0) return 'chat';
        return 'items';
    }

    private refreshMembers(): void {
        const id = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        if (!id || !key) return;
        void this.store.fetchMembersForList(id, key)
            .then(members => {
                if (this.store.currentListId() === id) {
                    this.members.set(members);
                    this.membersLoaded.set(true);
                }
            })
            .catch(() => {
                if (this.store.currentListId() === id) {
                    this.membersLoaded.set(true);
                }
            });
    }

    async ngOnDestroy(): Promise<void> {
        this.store.setVisibleListTabs([]);
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
            this.prefsCache.set(PANE_WIDTH_KEY, this.paneWidth());
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}
