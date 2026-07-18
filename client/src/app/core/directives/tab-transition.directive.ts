import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { cloneSnapshot } from '../utils/page-snapshot.util';
import { prefersReducedMotion } from '../utils/reduced-motion.util';
import { SlideDirection, resolveSlideDirection, runSlideTransition } from '../utils/slide-transition.util';

type TabDirection = SlideDirection;

@Directive({
    selector: '[appTabTransition]',
    standalone: true,
})
export class TabTransitionDirective implements OnInit, OnDestroy {

    @Input() appTabOrder: string[] = ['items', 'chat', 'whisper', 'charon', 'nemesis'];

    // When true the outlet still swaps its routed component, but without the slide animation — used on
    // desktop where an instant panel switch is wanted while navigation stays fully route-driven.
    @Input({ alias: 'appTabTransitionDisabled' }) disabled = false;

    private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    private readonly outlet = inject(RouterOutlet, { self: true });
    private readonly router = inject(Router);
    // The ActivatedRoute of whatever component hosts this outlet+directive
    // (e.g. ListDetailComponent, or NemesisTabComponent for its own nested
    // outlet). Its pathFromRoot tells us exactly how many URL segments are
    // already consumed above this outlet, so the segment this outlet is
    // switching between is always the very next one — regardless of how
    // deep this outlet sits, and regardless of any further child routes
    // nested inside whatever it activates (e.g. nemesis/expenses vs.
    // nemesis/settlements). Using the *last* URL segment instead would break
    // as soon as the activated tab has its own child routes: while still on
    // such a sub-route, the last segment is the child's, not this outlet's.
    private readonly route = inject(ActivatedRoute);

    private ownSegmentIndex(): number {
        return this.route.snapshot.pathFromRoot.reduce((acc, r) => acc + r.url.length, 0);
    }

    private tabSegment(url: string): string {
        const path = url.split('?')[0].split('#')[0];
        const parts = path.split('/').filter(Boolean);
        return parts[this.ownSegmentIndex()] ?? '';
    }

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
        if (this.disabled) return;
        // Any navigation in the app fires here, not just ones touching this
        // outlet (e.g. opening a list at all, or list-detail's own redirect
        // to its default tab) — only cancel/recapture for ones that actually
        // swap the tab, otherwise an unrelated navigation can cancel a
        // still-playing slide.
        const fromKey = this.tabSegment(this.router.url);
        const toKey = this.tabSegment(nextUrl);
        const direction = resolveSlideDirection(this.appTabOrder, fromKey, toKey);

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

    private runSlide(incomingEl: HTMLElement, outgoingClone: HTMLElement, direction: Exclude<TabDirection, 'none'>): () => void {
        const parent = this.hostEl.parentElement;
        if (!parent) return () => { };

        return runSlideTransition(parent, incomingEl, outgoingClone, direction);
    }
}
