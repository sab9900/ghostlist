import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { InfoCenterService } from './core/services/info-center.service';
import { LayoutService } from './core/services/layout.service';
import { SensitiveListsService } from './core/services/sensitive-lists.service';
import { UserPreferencesService } from './core/services/user-preferences.service';
import { WebAuthnService } from './core/services/webauthn.service';
import { ListsComponent } from './features/lists/lists.component';
import { ImageViewerComponent } from './shared/image-viewer/image-viewer.component';
import { InfoOverlayComponent } from './shared/info-overlay/info-overlay.component';
import { OfflineBannerComponent } from './shared/offline-banner/offline-banner.component';
import { PwaInstallBannerComponent } from './shared/pwa-install-banner/pwa-install-banner.component';

const SIDEBAR_WIDTH_KEY = 'gl_sidebar_width';
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 320;

function loadSidebarWidth(): number {
    try {
        const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
        if (stored) {
            const n = parseInt(stored, 10);
            if (!isNaN(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
        }
    } catch { }
    return SIDEBAR_DEFAULT;
}

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ListsComponent, TranslatePipe, FormsModule, PwaInstallBannerComponent, OfflineBannerComponent, InfoOverlayComponent, ImageViewerComponent],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App {
    protected readonly layout = inject(LayoutService);
    protected readonly webAuthn = inject(WebAuthnService);
    protected readonly infoCenter = inject(InfoCenterService);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly sensitiveLists = inject(SensitiveListsService);
    private readonly router = inject(Router);

    protected readonly locked    = signal(false);
    protected readonly unlocking = signal(false);
    protected readonly lockError = signal(false);

    /** First-run name onboarding dialog: shown once preferences are hydrated and
     *  the user hasn't yet saved a name or explicitly skipped the prompt. */
    protected readonly showNameDialog = computed(() => this.prefs.hydrated() && !this.prefs.onboarded());
    protected readonly pendingName = signal('');

    private backgroundedAt: number | null = null;

    private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        void this.webAuthn.init().then(() => {
            if (this.webAuthn.isEnabled()) {
                this.locked.set(true);
                void this.triggerBiometric();
            }
        });

        if (Capacitor.isNativePlatform()) {
            StatusBar.setStyle({ style: Style.Default }).catch(() => {});

            Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
                document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
            });
            Keyboard.addListener('keyboardWillHide', () => {
                document.documentElement.style.setProperty('--keyboard-height', '0px');
            });

            CapacitorApp.addListener('appUrlOpen', ({ url }: { url: string }) => {
                try {
                    const parsed = new URL(url);
                    const slug = parsed.pathname + parsed.search + (parsed.hash ? parsed.hash : '');
                    if (slug) void this.router.navigateByUrl(slug);
                } catch { }
            });

            CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                if (!isActive) {
                    this.backgroundedAt = Date.now();
                    this.clearInactivityTimer();
                } else {
                    if (this.webAuthn.isEnabled() && this.backgroundedAt !== null) {
                        const ms = this.webAuthn.getTimeoutMs();
                        if (ms !== null && Date.now() - this.backgroundedAt >= ms) {
                            this.engageLock();
                        }
                    }
                    this.backgroundedAt = null;
                    this.scheduleInactivityTimer();
                }
            });
        }

        this.setupActivityListeners();
        this.scheduleInactivityTimer();

        this.infoCenter.checkForUpdates();
    }

    engageLock(): void {
        this.sensitiveLists.hide();
        if (this.locked()) return;
        this.locked.set(true);
        void this.triggerBiometric();
    }

    async triggerBiometric(): Promise<void> {
        this.unlocking.set(true);
        this.lockError.set(false);
        try {
            const ok = await this.webAuthn.authenticate();
            if (ok) {
                this.locked.set(false);
                this.scheduleInactivityTimer();
            } else {
                this.lockError.set(true);
            }
        } catch {
            this.lockError.set(true);
        } finally {
            this.unlocking.set(false);
        }
    }

    private setupActivityListeners(): void {
        const onActivity = () => this.onUserActivity();
        for (const evt of ['mousemove', 'touchstart', 'keydown', 'click', 'scroll']) {
            document.addEventListener(evt, onActivity, { passive: true });
        }
    }

    private onUserActivity(): void {
        if (!this.locked()) {
            this.scheduleInactivityTimer();
        }
    }

    private clearInactivityTimer(): void {
        if (this.inactivityTimer !== null) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    private scheduleInactivityTimer(): void {
        this.clearInactivityTimer();
        if (!this.webAuthn.isEnabled()) return;
        const ms = this.webAuthn.getTimeoutMs();
        if (ms === null) return;
        this.inactivityTimer = setTimeout(() => {
            this.engageLock();
        }, ms);
    }

    protected readonly currentUrl = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map(e => (e as NavigationEnd).urlAfterRedirects),
            startWith(this.router.url),
        ),
        { initialValue: this.router.url },
    );

    protected readonly showDetail = computed(() => {
        const url = this.currentUrl();
        return !!(url && url !== '/');
    });

    protected readonly sidebarWidth = signal(loadSidebarWidth());
    protected readonly resizing = signal(false);

    onResizeStart(startEvent: MouseEvent): void {
        startEvent.preventDefault();

        const startX = startEvent.clientX;
        const startWidth = this.sidebarWidth();

        this.resizing.set(true);

        const onMove = (e: MouseEvent) => {
            const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + e.clientX - startX));
            this.sidebarWidth.set(next);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.resizing.set(false);
            try {
                localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.sidebarWidth()));
            } catch { }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    saveSenderName(): void {
        const name = this.pendingName().trim();
        if (!name) return;
        this.prefs.setSenderName(name);
        this.pendingName.set('');
    }

    skipNameDialog(): void {
        this.prefs.markOnboarded();
        this.pendingName.set('');
    }
}
