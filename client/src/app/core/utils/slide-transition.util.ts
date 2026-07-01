import { IOS_EASE, LEAVE_BLUR_PX, LEAVE_DARKEN, TAB_SWITCH_DURATION_MS } from './ios-motion';

export type SlideDirection = 'forward' | 'backward' | 'none';

export function resolveSlideDirection<T>(order: readonly T[], from: T, to: T): SlideDirection {
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return 'none';
    return toIndex > fromIndex ? 'forward' : 'backward';
}

export function runSlideTransition(
    parent: HTMLElement,
    incomingEl: HTMLElement,
    outgoingClone: HTMLElement,
    direction: Exclude<SlideDirection, 'none'>,
): () => void {
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

    parent.insertBefore(outgoingClone, incomingEl);

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
