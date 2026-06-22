import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { WebAuthnService } from '../../core/services/webauthn.service';
import { AppStore } from '../../store/app.store';
import { GhostMistComponent } from '../ghost-mist/ghost-mist.component';

const MIN_VISIBLE_MS = 1000;

@Component({
    selector: 'app-loading-overlay',
    imports: [TranslatePipe, GhostMistComponent],
    templateUrl: './loading-overlay.component.html',
    styleUrl: './loading-overlay.component.scss',
})
export class LoadingOverlayComponent implements OnDestroy {
    private readonly store = inject(AppStore);
    private readonly prefs = inject(UserPreferencesService);
    private readonly webAuthn = inject(WebAuthnService);

    // Visible from the very first render — never delayed. Everything this
    // overlay is hiding (known lists, preferences/sender name, biometric
    // lock state) is read from IndexedDB right at startup, so there's no
    // "warm cache, skip the overlay" case worth optimizing for here: showing
    // immediately is what stops the name dialog / lock screen / lists empty
    // state from flashing underneath it while those reads are still in flight.
    protected readonly visible = signal(true);

    private readonly shownAt = Date.now();
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private hidden = false;

    constructor() {
        // Only ever extends how long the overlay stays up, never shortens it:
        // once every read below has resolved, wait out whatever's left of
        // MIN_VISIBLE_MS since first paint. If that's already elapsed, hide
        // immediately instead of waiting further.
        effect(() => {
            const allLoaded =
                this.store.listsLoaded() &&
                this.prefs.hydrated() &&
                this.webAuthn.ready();
            if (allLoaded) this.scheduleHide();
        });
    }

    ngOnDestroy(): void {
        this.clearHideTimer();
    }

    private scheduleHide(): void {
        if (this.hidden) return;
        this.hidden = true;
        const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - this.shownAt));
        this.clearHideTimer();
        this.hideTimer = setTimeout(() => {
            this.hideTimer = null;
            this.visible.set(false);
        }, remaining);
    }

    private clearHideTimer(): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }
}
