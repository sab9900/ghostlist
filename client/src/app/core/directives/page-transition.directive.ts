import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { PageTransitionService } from '../services/page-transition.service';
import {
    IOS_EASE,
    LEAVE_BLUR_PX,
    LEAVE_DARKEN,
    PAGE_POP_DURATION_MS,
    PAGE_PUSH_DURATION_MS,
    PAGE_REPLACE_DURATION_MS,
    PARALLAX_PERCENT,
    SCRIM_OPACITY,
    Z_BACK,
    Z_FRONT,
    Z_SCRIM,
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

        // TEMP DEBUG — remove once the first-transition issue is diagnosed.
        console.debug('[page-transition] onNavigationStart', {
            nextUrl, direction, gestureDriven, hasActivatedOnce: this.hasActivatedOnce,
        });

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

        // TEMP DEBUG
        console.debug('[page-transition] captured snapshot', {
            outgoingElFound: !!outgoingEl,
            outgoingElTag: outgoingEl?.tagName,
            cloneCreated: !!this.pendingOutgoingClone,
        });
    }

    private onActivate(): void {
        const direction = this.pendingDirection;
        const outgoingClone = this.pendingOutgoingClone;
        this.pendingDirection = null;
        this.pendingOutgoingClone = null;

        const incomingEl = this.hostEl.nextElementSibling as HTMLElement | null;

        // TEMP DEBUG — remove once the first-transition issue is diagnosed.
        console.debug('[page-transition] onActivate', {
            hasActivatedOnce: this.hasActivatedOnce,
            direction,
            hasOutgoingClone: !!outgoingClone,
            incomingElFound: !!incomingEl,
            incomingElTag: incomingEl?.tagName,
        });

        if (!this.hasActivatedOnce) {
            this.hasActivatedOnce = true;
            console.debug('[page-transition] SKIPPED — first-ever activation');
            return;
        }

        if (!incomingEl || direction === null) {
            console.debug('[page-transition] BAILED — missing incomingEl or direction is null');
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

        const scrim = this.matchLayersToIncoming(incomingEl, outgoingClone, parent);

        outgoingClone.style.zIndex = String(Z_BACK);
        scrim.style.zIndex = String(Z_SCRIM);
        incomingEl.style.zIndex = String(Z_FRONT);

        const frontAnim = incomingEl.animate(
            [{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }],
            { duration: PAGE_PUSH_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );
        const backAnim = outgoingClone.animate(
            [
                { transform: 'translate3d(0,0,0)', filter: 'blur(0px) brightness(1)' },
                { transform: `translate3d(-${PARALLAX_PERCENT}%,0,0)`, filter: `blur(${LEAVE_BLUR_PX}px) brightness(${LEAVE_DARKEN})` },
            ],
            { duration: PAGE_PUSH_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );
        const scrimAnim = scrim.animate(
            [{ opacity: 0 }, { opacity: SCRIM_OPACITY }],
            { duration: PAGE_PUSH_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );

        return this.finishLayeredTransition(incomingEl, outgoingClone, scrim, [frontAnim, backAnim, scrimAnim]);
    }

    private runPop(incomingEl: HTMLElement, outgoingClone: HTMLElement): () => void {
        const parent = this.hostEl.parentElement;
        if (!parent) return this.runFade(incomingEl);

        const scrim = this.matchLayersToIncoming(incomingEl, outgoingClone, parent);

        outgoingClone.style.zIndex = String(Z_FRONT);
        scrim.style.zIndex = String(Z_SCRIM);
        incomingEl.style.zIndex = String(Z_BACK);

        const frontAnim = outgoingClone.animate(
            [
                { transform: 'translate3d(0,0,0)', filter: 'blur(0px) brightness(1)' },
                { transform: 'translate3d(100%,0,0)', filter: `blur(${LEAVE_BLUR_PX}px) brightness(${LEAVE_DARKEN})` },
            ],
            { duration: PAGE_POP_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );
        const backAnim = incomingEl.animate(
            [{ transform: `translate3d(-${PARALLAX_PERCENT}%,0,0)` }, { transform: 'translate3d(0,0,0)' }],
            { duration: PAGE_POP_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );
        const scrimAnim = scrim.animate(
            [{ opacity: SCRIM_OPACITY }, { opacity: 0 }],
            { duration: PAGE_POP_DURATION_MS, easing: IOS_EASE, fill: 'both' },
        );

        return this.finishLayeredTransition(incomingEl, outgoingClone, scrim, [frontAnim, backAnim, scrimAnim]);
    }

    private matchLayersToIncoming(incomingEl: HTMLElement, outgoingClone: HTMLElement, parent: HTMLElement): HTMLElement {
        const scrim = document.createElement('div');
        scrim.setAttribute('aria-hidden', 'true');
        scrim.style.background = '#000';
        scrim.style.opacity = '0';
        scrim.style.pointerEvents = 'none';

        for (const layer of [outgoingClone, scrim]) {
            layer.style.position = 'absolute';
            layer.style.top = '0';
            layer.style.left = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.margin = '0';
            layer.style.willChange = 'transform';
        }

        parent.insertBefore(outgoingClone, this.hostEl);
        parent.insertBefore(scrim, this.hostEl);

        incomingEl.style.position = 'relative';
        incomingEl.style.willChange = 'transform';

        return scrim;
    }

    private finishLayeredTransition(
        incomingEl: HTMLElement,
        outgoingClone: HTMLElement,
        scrim: HTMLElement,
        anims: Animation[],
    ): () => void {
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            for (const anim of anims) anim.cancel();
            outgoingClone.remove();
            scrim.remove();
            incomingEl.style.position = '';
            incomingEl.style.zIndex = '';
            incomingEl.style.willChange = '';
        };

        Promise.all(anims.map((a) => a.finished)).then(cleanup).catch(cleanup);
        return cleanup;
    }
}
