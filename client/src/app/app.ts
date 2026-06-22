import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LucideBell, LucideLock } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, map, startWith } from 'rxjs';
import { PageTransitionDirective } from './core/directives/page-transition.directive';
import { BadgeService } from './core/services/badge.service';
import { InfoCenterService } from './core/services/info-center.service';
import { KeyboardInsetService } from './core/services/keyboard-inset.service';
import { LayoutService } from './core/services/layout.service';
import { MasterPasswordService } from './core/services/master-password.service';
import { PrefsCacheService } from './core/services/prefs-cache.service';
import { PushNotificationService } from './core/services/push-notification.service';
import { SensitiveListsService } from './core/services/sensitive-lists.service';
import { UserPreferencesService } from './core/services/user-preferences.service';
import { VaultKeyService } from './core/services/vault-key.service';
import { WebAuthnService } from './core/services/webauthn.service';
import { AppStore } from './store/app.store';
import { ListsComponent } from './features/lists/lists.component';
import { ImageViewerComponent } from './shared/image-viewer/image-viewer.component';
import { InfoOverlayComponent } from './shared/info-overlay/info-overlay.component';
import { LoadingOverlayComponent } from './shared/loading-overlay/loading-overlay.component';
import { OfflineBannerComponent } from './shared/offline-banner/offline-banner.component';
import { PwaInstallBannerComponent } from './shared/pwa-install-banner/pwa-install-banner.component';
import { SnackStackComponent } from './shared/snack-stack/snack-stack.component';

const SIDEBAR_WIDTH_KEY = 'gl_sidebar_width';
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 320;


// Reads synchronously from PrefsCacheService's in-memory cache rather than
// IndexedDB directly: App is only ever constructed after the cache's
// warm-up app initializer has resolved (see app.config.ts), so the value is
// already available without an async round-trip — no layout flash on load.
function loadSidebarWidth(prefsCache: PrefsCacheService): number {
    const stored = prefsCache.get<number | null>(SIDEBAR_WIDTH_KEY, null);
    if (stored !== null && !isNaN(stored)) {
        return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, stored));
    }
    return SIDEBAR_DEFAULT;
}

@Component({
    selector: 'app-root',
    imports: [LucideBell, LucideLock, RouterOutlet, PageTransitionDirective, ListsComponent, TranslatePipe, FormsModule, PwaInstallBannerComponent, OfflineBannerComponent, InfoOverlayComponent, LoadingOverlayComponent, ImageViewerComponent, SnackStackComponent],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App {
    protected readonly layout = inject(LayoutService);
    private readonly keyboardInset = inject(KeyboardInsetService);
    private readonly prefsCache = inject(PrefsCacheService);

    private readonly _badge = inject(BadgeService);
    protected readonly webAuthn = inject(WebAuthnService);
    protected readonly infoCenter = inject(InfoCenterService);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly push = inject(PushNotificationService);
    private readonly sensitiveLists = inject(SensitiveListsService);
    private readonly router = inject(Router);
    private readonly masterPassword = inject(MasterPasswordService);
    private readonly vaultKey = inject(VaultKeyService);
    private readonly store = inject(AppStore);

    protected readonly isWebPlatform = Capacitor.getPlatform() === 'web';

    protected readonly locked = signal(false);
    protected readonly unlocking = signal(false);
    protected readonly lockError = signal(false);
    protected readonly showPasswordFallback = signal(false);
    protected readonly passwordInput = signal('');
    protected readonly showRecoveryFallback = signal(false);
    protected readonly recoveryInput = signal('');

    protected readonly showNameDialog = computed(() => this.prefs.hydrated() && !this.prefs.onboarded());
    protected readonly pendingName = signal('');

    protected readonly showNotifDialog = computed(() =>
        this.prefs.onboarded() &&
        !this.prefs.notifPrompted() &&
        this.push.webPushPermission() === 'default',
    );

    protected readonly notifEnabling = signal(false);

    private backgroundedAt: number | null = null;

    private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        void this.webAuthn.init().then(() => {
            if (this.webAuthn.isEnabled()) {
                this.locked.set(true);
                void this.triggerBiometric();
            }
        });

        this.keyboardInset.start();

        if (Capacitor.isNativePlatform()) {
            StatusBar.setStyle({ style: Style.Default }).catch(() => { });

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
        this.vaultKey.lock();
        this.store.lockKnownLists();
        this.showPasswordFallback.set(false);
        this.showRecoveryFallback.set(false);
        this.passwordInput.set('');
        this.recoveryInput.set('');
        if (this.locked()) return;
        this.locked.set(true);
        void this.triggerBiometric();
    }

    private async finishUnlock(): Promise<void> {
        await this.store.unlockKnownLists();
        this.locked.set(false);
        this.showPasswordFallback.set(false);
        this.showRecoveryFallback.set(false);
        this.passwordInput.set('');
        this.recoveryInput.set('');
        this.scheduleInactivityTimer();
    }

    async triggerBiometric(): Promise<void> {
        this.unlocking.set(true);
        this.lockError.set(false);
        try {
            const ok = await this.webAuthn.authenticate();
            if (ok) {
                await this.finishUnlock();
            } else {
                this.lockError.set(true);
            }
        } catch {
            this.lockError.set(true);
        } finally {
            this.unlocking.set(false);
        }
    }

    useFallbackPassword(): void {
        this.lockError.set(false);
        this.showPasswordFallback.set(true);
        this.showRecoveryFallback.set(false);
    }

    useFallbackRecovery(): void {
        this.lockError.set(false);
        this.showRecoveryFallback.set(true);
        this.showPasswordFallback.set(false);
    }

    async submitPasswordUnlock(): Promise<void> {
        const password = this.passwordInput();
        if (!password || this.unlocking()) return;
        this.unlocking.set(true);
        this.lockError.set(false);
        try {
            const ok = await this.masterPassword.verifyPassword(password);
            if (ok) {
                await this.finishUnlock();
            } else {
                this.lockError.set(true);
            }
        } catch {
            this.lockError.set(true);
        } finally {
            this.unlocking.set(false);
        }
    }

    async submitRecoveryUnlock(): Promise<void> {
        const code = this.recoveryInput();
        if (!code || this.unlocking()) return;
        this.unlocking.set(true);
        this.lockError.set(false);
        try {
            const ok = await this.masterPassword.unlockWithRecoveryCode(code);
            if (ok) {
                await this.finishUnlock();
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

    protected readonly sidebarWidth = signal(loadSidebarWidth(this.prefsCache));
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
            this.prefsCache.set(SIDEBAR_WIDTH_KEY, this.sidebarWidth());
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

    async enableNotifications(): Promise<void> {
        if (this.notifEnabling()) return;
        this.notifEnabling.set(true);
        try {
            // lastListIds is cached in the service from the store's initialize() call
            await this.push.enablePush(this.push.lastKnownListIds);
            this.prefs.setNotificationsEnabled(true);
        } finally {
            this.notifEnabling.set(false);
            this.prefs.markNotifPrompted();
        }
    }

    dismissNotifDialog(): void {
        this.prefs.markNotifPrompted();
    }
}
