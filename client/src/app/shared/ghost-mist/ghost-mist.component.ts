import { Component, OnDestroy, effect, input, signal } from '@angular/core';
import { prefersReducedMotion } from '../../core/utils/reduced-motion.util';
import { GhostMistMode } from '../../core/services/user-preferences.service';

const IDLE_DELAY_MS: Record<'idle-3s' | 'idle-10s', number> = {
    'idle-3s': 3_000,
    'idle-10s': 10_000,
};

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const;

@Component({
    selector: 'app-ghost-mist',
    templateUrl: './ghost-mist.component.html',
    styleUrl: './ghost-mist.component.scss',
})
export class GhostMistComponent implements OnDestroy {
    readonly mode = input<GhostMistMode>('off');

    protected readonly reducedMotion = prefersReducedMotion();
    protected readonly streaks = [0, 1, 2, 3, 4];
    protected readonly idle = signal(false);

    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private listening = false;

    private readonly onActivity = (): void => {
        this.idle.set(false);
        this.armTimer();
    };

    constructor() {
        effect(() => {
            const mode = this.mode();

            if (this.reducedMotion || mode === 'off') {
                this.detachListeners();
                this.clearTimer();
                this.idle.set(false);
                return;
            }

            if (mode === 'always') {
                this.detachListeners();
                this.clearTimer();
                this.idle.set(true);
                return;
            }

            this.attachListeners();
            this.armTimer();
        });
    }

    ngOnDestroy(): void {
        this.detachListeners();
        this.clearTimer();
    }

    private armTimer(): void {
        this.clearTimer();
        const mode = this.mode();
        if (mode !== 'idle-3s' && mode !== 'idle-10s') return;
        this.idleTimer = setTimeout(() => this.idle.set(true), IDLE_DELAY_MS[mode]);
    }

    private clearTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    private attachListeners(): void {
        if (this.listening) return;
        this.listening = true;
        for (const evt of ACTIVITY_EVENTS) document.addEventListener(evt, this.onActivity, { passive: true });
    }

    private detachListeners(): void {
        if (!this.listening) return;
        this.listening = false;
        for (const evt of ACTIVITY_EVENTS) document.removeEventListener(evt, this.onActivity);
    }
}
