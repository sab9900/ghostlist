import { Directive, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';

/**
 * Detects an iOS-style "swipe from the left edge" gesture and emits
 * `swipeBack` once the user has dragged far enough to the right.
 *
 * While the gesture is in progress, the host element gets a live
 * `--swipe-progress` CSS variable (0..1) and an `is-swiping-back` class,
 * so the template can show a drag-following transition if desired.
 */
@Directive({
    selector: '[appSwipeBack]',
    standalone: true,
})
export class SwipeBackDirective implements OnDestroy {

    /** Set to true to disable the gesture (e.g. while a drawer/modal is open). */
    @Input('appSwipeBackDisabled') disabled = false;

    /** How close to the left edge a touch must start to count as a back-swipe. */
    @Input() swipeBackEdge = 32;

    /** Horizontal distance (px) required to trigger `swipeBack`. */
    @Input() swipeBackThreshold = 80;

    @Output() swipeBack = new EventEmitter<void>();

    private readonly elementRef = inject(ElementRef<HTMLElement>);

    private tracking = false;
    private startX = 0;
    private startY = 0;
    private axisLocked: 'x' | 'y' | null = null;

    @HostListener('touchstart', ['$event'])
    onTouchStart(event: TouchEvent): void {
        if (this.disabled || event.touches.length !== 1) return;

        const touch = event.touches[0];
        if (touch.clientX > this.swipeBackEdge) return;

        this.tracking = true;
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.axisLocked = null;
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
        }

        if (dx <= 0) {
            this.setProgress(0);
            return;
        }

        this.setProgress(Math.min(1, dx / this.swipeBackThreshold));
    }

    @HostListener('touchend')
    @HostListener('touchcancel')
    onTouchEnd(): void {
        if (!this.tracking) return;

        const progress = parseFloat(this.elementRef.nativeElement.style.getPropertyValue('--swipe-progress') || '0');
        this.reset();

        if (this.axisLocked === 'x' && progress >= 1) {
            this.swipeBack.emit();
        }
    }

    ngOnDestroy(): void {
        this.reset();
    }

    private setProgress(progress: number): void {
        const el = this.elementRef.nativeElement;
        el.style.setProperty('--swipe-progress', String(progress));
        el.classList.toggle('is-swiping-back', progress > 0);
    }

    private reset(): void {
        this.tracking = false;
        this.axisLocked = null;
        const el = this.elementRef.nativeElement;
        el.style.removeProperty('--swipe-progress');
        el.classList.remove('is-swiping-back');
    }
}
