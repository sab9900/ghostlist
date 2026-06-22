/**
 * Angular drops a lazy-loaded component's emulated-encapsulation <style>
 * rules from the shared stylesheet host the moment its last live instance
 * is destroyed (see DomRendererFactory2 / `removeStylesOnCompDestroy`) — and
 * that destroy happens almost immediately after NavigationStart, well before
 * a push/pop/swipe animation has finished playing. A cloneNode(true) keeps
 * every class and attribute, but not the stylesheet those classes depend on,
 * so without rescuing it the snapshot goes unstyled the instant the real
 * page is torn down.
 *
 * The fix is to freeze each element's *computed* style onto itself as
 * inline CSS while the source is still alive. Walking every computed
 * property (~300, via `CSSStyleDeclaration.item`) on every element is what
 * made leaving a long chat thread visibly stall — only a curated, much
 * shorter list of visually-relevant properties is read here instead, which
 * cuts the per-element cost by well over an order of magnitude. A hard cap
 * on the number of elements visited keeps even pathologically long pages
 * (hundreds of chat bubbles) from blocking the main thread for long.
 */
const FREEZE_PROPERTIES = [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'transform', 'transform-origin', 'mix-blend-mode',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'align-items', 'align-content', 'align-self', 'justify-content', 'justify-items',
    'gap', 'row-gap', 'column-gap', 'box-sizing',
    'overflow', 'overflow-x', 'overflow-y',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
    'color', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
    'text-align', 'text-decoration-line', 'text-overflow', 'white-space', 'vertical-align',
    'opacity', 'box-shadow', 'filter', 'backdrop-filter', 'object-fit', 'object-position',
    'fill', 'stroke', 'stroke-width',
] as const;

const MAX_FROZEN_ELEMENTS = 1500;

function freezeComputedStyles(source: Element, clone: HTMLElement): void {
    const computed = window.getComputedStyle(source);
    const declaration = clone.style;
    for (const prop of FREEZE_PROPERTIES) {
        declaration.setProperty(prop, computed.getPropertyValue(prop));
    }
}

function freezeTree(source: Element, clone: Element, budget: { remaining: number }): void {
    if (budget.remaining <= 0) return;
    budget.remaining--;
    freezeComputedStyles(source, clone as HTMLElement);

    const sourceChildren = source.children;
    const cloneChildren = clone.children;
    const length = Math.min(sourceChildren.length, cloneChildren.length);
    for (let i = 0; i < length && budget.remaining > 0; i++) {
        freezeTree(sourceChildren[i], cloneChildren[i], budget);
    }
}

/**
 * Freezes a visual copy of a page's root element so it can keep being shown
 * (peeking behind a dragged page, or sliding out underneath an incoming one)
 * for the brief moment after the real Angular component behind it has
 * already been destroyed by the router. Purely cosmetic — never reattached
 * to the app, never interactive.
 */
export function cloneSnapshot(source: HTMLElement): HTMLElement {
    const clone = source.cloneNode(true) as HTMLElement;
    freezeTree(source, clone, { remaining: MAX_FROZEN_ELEMENTS });

    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    clone.style.pointerEvents = 'none';
    clone.style.userSelect = 'none';
    return clone;
}
