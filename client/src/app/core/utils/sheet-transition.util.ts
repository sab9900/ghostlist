import { prefersReducedMotion } from './reduced-motion.util';

const DURATION_MS = 200;

// Mirrors the CSS entrance keyframes (overlay-in / sheet-in / dialog-in) used across the
// Nemesis sheets and dialogs, just played in reverse via the Web Animations API. Angular's @if
// removes elements from the DOM the instant their guard flips to false, so there's no way for a
// plain CSS "-out" keyframe to ever get a chance to play — callers await this before flipping
// the guard, which delays the removal until the reverse animation has actually finished.
export function animateOverlayClose(overlayEl: HTMLElement | undefined | null): Promise<void> {
    if (!overlayEl || prefersReducedMotion()) return Promise.resolve();

    const innerEl = overlayEl.querySelector<HTMLElement>('.sheet, .dialog');
    const isCentered = window.matchMedia('(min-width: 640px)').matches;

    const animations: Animation[] = [
        overlayEl.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: DURATION_MS, easing: 'ease-in', fill: 'forwards' },
        ),
    ];

    if (innerEl) {
        const keyframes = isCentered
            ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96) translateY(8px)' }]
            : [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }];
        animations.push(innerEl.animate(keyframes, { duration: DURATION_MS, easing: 'ease-in', fill: 'forwards' }));
    }

    return Promise.all(animations.map(a => a.finished)).then(() => undefined).catch(() => undefined);
}
