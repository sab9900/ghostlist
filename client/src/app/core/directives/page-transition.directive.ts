import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { PageTransitionService } from '../services/page-transition.service';
import {
    IOS_EASE,
    PAGE_POP_DURATION_MS,
    PAGE_PUSH_DURATION_MS,
    PAGE_REPLACE_DURATION_MS,
    Z_BACK,
    Z_FRONT,
} from '../utils/ios-motion';
import { cloneSnapshot } from '../utils/page-snapshot.util';

type PendingDirection = 'push' | 'pop' | 'replace';

@Directive({
    selector: '[appPageTransition]',
    standalone: true,
})
export class PageTransitionDirective implements OnInit, OnDestroy {

    private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    private readonly outlet = inject(RouterOutlet, { self: true });
    private readonly router = inject(Router);
    private readonly transitions = inject(PageTransitionService);

    private navSub?: Subscription;
    private activateSub?: Subscription;

    private pendingDirection: PendingDirection | null = null;
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
        // resolveDirection/consumeGestureFlag must run for every navigation
        // (they keep the back-stack and the gesture flag in sync), but only
        // a push/pop actually changes what's activated in *this* outlet. A
        // same-segment navigation — e.g. list-detail's own redirect from
        // `/list/:id` to its default `/list/:id/items` tab — fires right
        // after a real push and must not be allowed to cancel its
        // still-playing animation.
        const direction = this.transitions.resolveDirection(nextUrl);
        const gestureDriven = this.transitions.consumeGestureFlag();

        if (direction === 'replace') return;

        this.cleanupActive?.();
        this.cleanupActive = null;

        if (gestureDriven) {
            this.pendingDirection = null;
            this.pendingOutgoingClone = null;
            return;
        }

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

        if (!incomingEl || direction === null) {
            return;
        }

        if (direction === 'push') {
            this.transitions.storeParentSnapshot(outgoingClone);
        } else if (direction === 'pop') {
            this.transitions.storeParentSnapshot(null);
        }

        if (this.transitions.reducedMotion() || direction === 'replace' || !outgoingClone) {
            this.cleanupActive = this.runFade(incomingEl);
            return;
        }

        this.cleanupActive = direction === 'push'
            ? this.runPush(incomingEl, outgoingClone)
            : this.runPop(incomingEl, outgoingClone);
    }

    private runFade(incomingEl: HTMLElement): () => void {
        const anim = incomingEl.animate(
            [{ opacity: 0.35 }, { opacity: 1 }],
            { duration: PAGE_REPLACE_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );

        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            anim.cancel();
        };

        anim.finished.then(cleanup).catch(cleanup);
        return cleanup;
    }

    private runPush(incomingEl: HTMLElement, outgoingClone: HTMLElement): () => void {
        const parent = this.hostEl.parentElement;
        if (!parent) return this.runFade(incomingEl);

        this.mountBackLayer(incomingEl, outgoingClone, parent);

        outgoingClone.style.zIndex = String(Z_BACK);
        incomingEl.style.zIndex = String(Z_FRONT);

        const frontAnim = incomingEl.animate(
            [{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }],
            { duration: PAGE_PUSH_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );

        return this.finishLayeredTransition(incomingEl, outgoingClone, [frontAnim]);
    }

    private runPop(incomingEl: HTMLElement, outgoingClone: HTMLElement): () => void {
        const parent = this.hostEl.parentElement;
        if (!parent) return this.runFade(incomingEl);

        this.mountBackLayer(incomingEl, outgoingClone, parent);

        outgoingClone.style.zIndex = String(Z_FRONT);
        incomingEl.style.zIndex = String(Z_BACK);

        const frontAnim = outgoingClone.animate(
            [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(100%,0,0)' }],
            { duration: PAGE_POP_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );

        return this.finishLayeredTransition(incomingEl, outgoingClone, [frontAnim]);
    }

    private mountBackLayer(incomingEl: HTMLElement, outgoingClone: HTMLElement, parent: HTMLElement): void {
        outgoingClone.style.position = 'absolute';
        outgoingClone.style.top = '0';
        outgoingClone.style.left = '0';
        outgoingClone.style.width = '100%';
        outgoingClone.style.height = '100%';
        outgoingClone.style.margin = '0';
        outgoingClone.style.willChange = 'transform';

        parent.insertBefore(outgoingClone, this.hostEl);

        incomingEl.style.position = 'relative';
        incomingEl.style.willChange = 'transform';
    }

    private finishLayeredTransition(
        incomingEl: HTMLElement,
        outgoingClone: HTMLElement,
        anims: Animation[],
    ): () => void {
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            for (const anim of anims) anim.cancel();
            outgoingClone.remove();
            incomingEl.style.position = '';
            incomingEl.style.zIndex = '';
            incomingEl.style.willChange = '';
        };

        Promise.all(anims.map((a) => a.finished)).then(cleanup).catch(cleanup);
        return cleanup;
    }
}
