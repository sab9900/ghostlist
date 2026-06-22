import { Directive, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';
import { HapticsService } from '../services/haptics.service';
import { PageTransitionService } from '../services/page-transition.service';
import {
    IOS_EASE,
    IOS_EASE_SNAP_BACK,
    PARALLAX_PERCENT,
    SCRIM_OPACITY,
    SWIPE_CANCEL_DURATION_MS,
    SWIPE_COMMIT_DURATION_MS,
    Z_BACK,
    Z_FRONT,
    Z_SCRIM,
} from '../utils/ios-motion';
import { prefersReducedMotion } from '../utils/reduced-motion.util';

interface TouchSample {
    t: number;
    x: number;
}

@Directive({
    selector: '[appSwipeBack]',
    standalone: true,
})
export class SwipeBackDirective implements OnDestroy {

    @Input('appSwipeBackDisabled') disabled = false;
    @Input() swipeBackEdge = 32;
    @Input() swipeBackCommitFraction = 0.5;

    @Output() swipeBack = new EventEmitter<void>();

    private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    private readonly haptics = inject(HapticsService);
    private readonly transitions = inject(PageTransitionService);

    private tracking = false;
    private startX = 0;
    private startY = 0;
    private axisLocked: 'x' | 'y' | null = null;
    private progress = 0;
    private thresholdCrossed = false;
    private samples: TouchSample[] = [];
    private viewportWidth = 1;

    private parentEl: HTMLElement | null = null;
    private peekEl: HTMLElement | null = null;
    private scrimEl: HTMLElement | null = null;

    @HostListener('touchstart', ['$event'])
    onTouchStart(event: TouchEvent): void {
        if (this.disabled || event.touches.length !== 1) return;

        const touch = event.touches[0];
        if (touch.clientX > this.swipeBackEdge) return;

        this.tracking = true;
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.axisLocked = null;
        this.progress = 0;
        this.thresholdCrossed = false;
        this.viewportWidth = window.innerWidth || this.el.clientWidth || 1;
        this.samples = [{ t: event.timeStamp, x: touch.clientX }];
    }

    @HostListener('touchmove', ['$event'])
    onTouchMove(event: TouchEvent): void {
        if (!this.tracking) return;

        const touch = event.touches[0];
        const dx = touch.clientX - this.startX;
        const dy = touch.clientY - this.startY;

        if (!this.axisLocked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            this.axisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (this.axisLocked !== 'x') {
                this.reset();
                return;
            }
            this.beginDrag();
        }

        this.samples.push({ t: event.timeStamp, x: touch.clientX });
        if (this.samples.length > 6) this.samples.shift();

        this.applyProgress(dx <= 0 ? 0 : Math.min(1, dx / this.viewportWidth));
    }

    @HostListener('touchend')
    onTouchEnd(): void {
        this.finishDrag();
    }

    @HostListener('touchcancel')
    onTouchCancel(): void {
        this.finishDrag();
    }

    ngOnDestroy(): void {
        this.teardownLayers();
    }

    private beginDrag(): void {
        const parent = this.el.parentElement;
        if (!parent) return;

        this.el.classList.add('is-swiping-back');
        this.parentEl = parent;
        parent.style.position = 'relative';

        const peek = this.transitions.takeParentSnapshotClone() ?? this.createFallbackPeek();
        peek.setAttribute('aria-hidden', 'true');
        peek.style.position = 'absolute';
        peek.style.top = '0';
        peek.style.left = '0';
        peek.style.width = '100%';
        peek.style.height = '100%';
        peek.style.margin = '0';
        peek.style.zIndex = String(Z_BACK);
        peek.style.willChange = 'transform';
        peek.style.pointerEvents = 'none';

        const scrim = document.createElement('div');
        scrim.setAttribute('aria-hidden', 'true');
        scrim.style.position = 'absolute';
        scrim.style.top = '0';
        scrim.style.left = '0';
        scrim.style.width = '100%';
        scrim.style.height = '100%';
        scrim.style.margin = '0';
        scrim.style.background = '#000';
        scrim.style.pointerEvents = 'none';
        scrim.style.zIndex = String(Z_SCRIM);

        parent.insertBefore(peek, this.el);
        parent.insertBefore(scrim, this.el);

        this.el.style.position = 'relative';
        this.el.style.zIndex = String(Z_FRONT);
        this.el.style.willChange = 'transform';
        this.el.style.boxShadow = '-12px 0 32px rgba(0, 0, 0, 0.35)';

        this.peekEl = peek;
        this.scrimEl = scrim;
    }

    private createFallbackPeek(): HTMLElement {
        const div = document.createElement('div');
        div.style.background = 'var(--color-bg)';
        return div;
    }

    private applyProgress(progress: number): void {
        this.progress = progress;
        this.el.style.transform = `translate3d(${progress * this.viewportWidth}px,0,0)`;

        if (this.peekEl) {
            this.peekEl.style.transform = `translate3d(${-PARALLAX_PERCENT + PARALLAX_PERCENT * progress}%,0,0)`;
        }
        if (this.scrimEl) {
            this.scrimEl.style.opacity = String(SCRIM_OPACITY * (1 - progress));
        }

        const crossed = progress >= this.swipeBackCommitFraction;
        if (crossed && !this.thresholdCrossed) {
            this.thresholdCrossed = true;
            this.haptics.swipeBackThresholdCross();
        } else if (!crossed && this.thresholdCrossed) {
            this.thresholdCrossed = false;
        }
    }

    private finishDrag(): void {
        if (!this.tracking) return;

        const wasHorizontal = this.axisLocked === 'x';
        const velocity = this.computeVelocity();
        this.tracking = false;
        this.axisLocked = null;

        if (!wasHorizontal || !this.peekEl || !this.scrimEl) {
            this.reset();
            return;
        }

        const shouldComplete = this.progress >= this.swipeBackCommitFraction
            || (this.progress > 0.05 && velocity > 0.55);

        if (shouldComplete) {
            this.commit();
        } else {
            this.cancel();
        }
    }

    private computeVelocity(): number {
        if (this.samples.length < 2) return 0;
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        const dt = last.t - first.t;
        return dt > 0 ? (last.x - first.x) / dt : 0;
    }

    private commit(): void {
        const el = this.el;
        const peek = this.peekEl;
        const scrim = this.scrimEl;
        if (!peek || !scrim) {
            this.reset();
            return;
        }

        this.transitions.beginGestureNavigation();

        if (prefersReducedMotion()) {
            this.teardownLayers();
            this.swipeBack.emit();
            return;
        }

        const fromX = this.progress * this.viewportWidth;
        const fromPeek = -PARALLAX_PERCENT + PARALLAX_PERCENT * this.progress;
        const fromScrim = SCRIM_OPACITY * (1 - this.progress);

        const frontAnim = el.animate(
            [{ transform: `translate3d(${fromX}px,0,0)` }, { transform: 'translate3d(100%,0,0)' }],
            { duration: SWIPE_COMMIT_DURATION_MS, easing: IOS_EASE, fill: 'forwards' },
        );
        peek.animate(
            [{ transform: `translate3d(${fromPeek}%,0,0)` }, { transform: 'translate3d(0,0,0)' }],
            { duration: SWIPE_COMMIT_DURATION_MS, easing: IOS_EASE, fill: 'forwards' },
        );
        scrim.animate(
            [{ opacity: String(fromScrim) }, { opacity: '0' }],
            { duration: SWIPE_COMMIT_DURATION_MS, easing: IOS_EASE, fill: 'forwards' },
        );

        const finish = () => {
            this.swipeBack.emit();
            this.teardownLayers();
        };

        frontAnim.finished.then(finish).catch(finish);
    }

    private cancel(): void {
        const el = this.el;
        const peek = this.peekEl;
        const scrim = this.scrimEl;
        if (!peek || !scrim) {
            this.reset();
            return;
        }

        const fromX = this.progress * this.viewportWidth;
        const fromPeek = -PARALLAX_PERCENT + PARALLAX_PERCENT * this.progress;
        const fromScrim = SCRIM_OPACITY * (1 - this.progress);

        const frontAnim = el.animate(
            [{ transform: `translate3d(${fromX}px,0,0)` }, { transform: 'translate3d(0,0,0)' }],
            { duration: SWIPE_CANCEL_DURATION_MS, easing: IOS_EASE_SNAP_BACK, fill: 'forwards' },
        );
        peek.animate(
            [{ transform: `translate3d(${fromPeek}%,0,0)` }, { transform: `translate3d(-${PARALLAX_PERCENT}%,0,0)` }],
            { duration: SWIPE_CANCEL_DURATION_MS, easing: IOS_EASE_SNAP_BACK, fill: 'forwards' },
        );
        scrim.animate(
            [{ opacity: String(fromScrim) }, { opacity: String(SCRIM_OPACITY) }],
            { duration: SWIPE_CANCEL_DURATION_MS, easing: IOS_EASE_SNAP_BACK, fill: 'forwards' },
        );

        const finish = () => this.reset();
        frontAnim.finished.then(finish).catch(finish);
    }

    private reset(): void {
        this.tracking = false;
        this.axisLocked = null;
        this.progress = 0;
        this.thresholdCrossed = false;
        this.teardownLayers();
    }

    private teardownLayers(): void {
        this.el.classList.remove('is-swiping-back');
        this.el.style.transform = '';
        this.el.style.position = '';
        this.el.style.zIndex = '';
        this.el.style.willChange = '';
        this.el.style.boxShadow = '';
        this.peekEl?.remove();
        this.scrimEl?.remove();
        this.peekEl = null;
        this.scrimEl = null;
        if (this.parentEl) this.parentEl.style.position = '';
        this.parentEl = null;
    }
}
