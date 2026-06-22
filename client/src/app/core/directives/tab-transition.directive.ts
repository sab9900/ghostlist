import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { IOS_EASE, LEAVE_BLUR_PX, LEAVE_DARKEN, TAB_SWITCH_DURATION_MS } from '../utils/ios-motion';
import { cloneSnapshot } from '../utils/page-snapshot.util';
import { prefersReducedMotion } from '../utils/reduced-motion.util';

type TabDirection = 'forward' | 'backward' | 'none';

function lastSegment(url: string): string {
    const path = url.split('?')[0].split('#')[0];
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
}

function resolveTabDirection(order: string[], fromKey: string, toKey: string): TabDirection {
    const fromIndex = order.indexOf(fromKey);
    const toIndex = order.indexOf(toKey);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return 'none';
    return toIndex > fromIndex ? 'forward' : 'backward';
}

@Directive({
    selector: '[appTabTransition]',
    standalone: true,
})
export class TabTransitionDirective implements OnInit, OnDestroy {

    @Input() appTabOrder: string[] = ['items', 'chat', 'whisper', 'charon'];

    private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    private readonly outlet = inject(RouterOutlet, { self: true });
    private readonly router = inject(Router);

    private navSub?: Subscription;
    private activateSub?: Subscription;

    private pendingDirection: TabDirection | null = null;
    private pendingOutgoingClone: HTMLElement | null = null;
    private hasActivatedOnce = false;
    private cleanupActive: (() => void) | null = null;

    ngOnInit(): void {
        this.navSub = this.router.events
            .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
            .subscribe((e) => this.onNavigationStart(e.url));

        this.activateSub = this.outlet.activateEvents.subscribe(() => this.onActivate());
    }

    ngOnDestroy(): void {
        this.navSub?.unsubscribe();
        this.activateSub?.unsubscribe();
        this.cleanupActive?.();
    }

    private onNavigationStart(nextUrl: string): void {
        // Any navigation in the app fires here, not just ones touching this
        // outlet (e.g. opening a list at all, or list-detail's own redirect
        // to its default tab) — only cancel/recapture for ones that actually
        // swap the tab, otherwise an unrelated navigation can cancel a
        // still-playing slide.
        const fromKey = lastSegment(this.router.url);
        const toKey = lastSegment(nextUrl);
        const direction = resolveTabDirection(this.appTabOrder, fromKey, toKey);

        if (direction === 'none') return;

        this.cleanupActive?.();
        this.cleanupActive = null;

        this.pendingDirection = direction;

        const outgoingEl = this.hostEl.nextElementSibling as HTMLElement | null;
        this.pendingOutgoingClone = outgoingEl ? cloneSnapshot(outgoingEl) : null;
    }

    private onActivate(): void {
        const direction = this.pendingDirection;
        const outgoingClone = this.pendingOutgoingClone;
        this.pendingDirection = null;
        this.pendingOutgoingClone = null;

        const incomingEl = this.hostEl.nextElementSibling as HTMLElement | null;

        if (!this.hasActivatedOnce) {
            this.hasActivatedOnce = true;
            return;
        }

        if (!incomingEl || !outgoingClone || direction === null || direction === 'none' || prefersReducedMotion()) {
            return;
        }

        this.cleanupActive = this.runSlide(incomingEl, outgoingClone, direction);
    }

    private runSlide(incomingEl: HTMLElement, outgoingClone: HTMLElement, direction: TabDirection): () => void {
        const parent = this.hostEl.parentElement;
        if (!parent) return () => { };

        parent.style.position = 'relative';

        outgoingClone.style.position = 'absolute';
        outgoingClone.style.top = '0';
        outgoingClone.style.left = '0';
        outgoingClone.style.width = '100%';
        outgoingClone.style.height = '100%';
        outgoingClone.style.margin = '0';
        outgoingClone.style.willChange = 'transform';

        incomingEl.style.position = 'relative';
        incomingEl.style.willChange = 'transform';

        parent.insertBefore(outgoingClone, this.hostEl);

        const sign = direction === 'forward' ? 1 : -1;

        const frontAnim = incomingEl.animate(
            [{ transform: `translate3d(${sign * 100}%,0,0)` }, { transform: 'translate3d(0,0,0)' }],
            { duration: TAB_SWITCH_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );
        const backAnim = outgoingClone.animate(
            [
                { transform: 'translate3d(0,0,0)', filter: 'blur(0px) brightness(1)' },
                { transform: `translate3d(${-sign * 100}%,0,0)`, filter: `blur(${LEAVE_BLUR_PX}px) brightness(${LEAVE_DARKEN})` },
            ],
            { duration: TAB_SWITCH_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );

        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            frontAnim.cancel();
            backAnim.cancel();
            outgoingClone.remove();
            incomingEl.style.position = '';
            incomingEl.style.willChange = '';
            parent.style.position = '';
        };

        Promise.all([frontAnim.finished, backAnim.finished]).then(cleanup).catch(cleanup);
        return cleanup;
    }
}
