import { Directive, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';

@Directive({
    selector: '[appViewportDwell]',
    standalone: true,
})
export class ViewportDwellDirective implements OnInit, OnChanges, OnDestroy {

    @Input('appViewportDwell') id!: string;
    @Input() dwellMs = 1500;
    @Output() dwellRead = new EventEmitter<string>();

    private readonly elementRef = inject(ElementRef<HTMLElement>);

    private observer?: IntersectionObserver;
    private timer?: ReturnType<typeof setTimeout>;
    private fired = false;
    private intersecting = false;
    private readonly onVisibilityChange = () => this.evaluate();

    ngOnInit(): void {
        if (this.id) {
            this.startObserving();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!changes['id'] || changes['id'].firstChange) return;
        const newId = changes['id'].currentValue as string;
        const oldId = changes['id'].previousValue as string;
        if (newId === oldId) return;

        // Cancel any in-flight observation for the old id
        this.cleanup();
        this.fired = false;
        this.intersecting = false;

        if (newId) {
            this.startObserving();
        }
    }

    ngOnDestroy(): void {
        this.cleanup();
    }

    private startObserving(): void {
        if (typeof IntersectionObserver === 'undefined') {
            this.timer = setTimeout(() => this.fire(), this.dwellMs);
            return;
        }

        this.observer = new IntersectionObserver(
            entries => {
                const entry = entries[entries.length - 1];
                this.intersecting = entry?.isIntersecting ?? false;
                this.evaluate();
            },
            { threshold: 0.6 },
        );
        this.observer.observe(this.elementRef.nativeElement);

        document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    private evaluate(): void {
        if (this.fired) return;

        if (this.intersecting && document.visibilityState === 'visible') {
            this.startTimer();
        } else {
            this.clearTimer();
        }
    }

    private startTimer(): void {
        if (this.timer || this.fired) return;
        this.timer = setTimeout(() => this.fire(), this.dwellMs);
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    private fire(): void {
        this.fired = true;
        this.dwellRead.emit(this.id);
        this.cleanup();
    }

    private cleanup(): void {
        this.clearTimer();
        this.observer?.disconnect();
        this.observer = undefined;
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
}
