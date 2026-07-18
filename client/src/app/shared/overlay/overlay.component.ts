import { DOCUMENT } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    inject,
    input,
    OnDestroy,
    output,
    viewChild,
    ViewEncapsulation,
} from '@angular/core';

export type OverlayVariant = 'dialog' | 'sheet';

// A dumb, presentational overlay shell. Its single job is to render a backdrop
// that reliably fills the *screen* and sits above everything (header, drawers),
// then project whatever dialog/sheet content the caller gives it.
//
// The hard part it solves: any ancestor with `transform`, `filter`,
// `container-type` or `will-change` becomes the containing block for
// `position: fixed`/`absolute` descendants, which is exactly why the in-place
// backdrops broke — e.g. `items-tab { container-type: inline-size }` trapped the
// item filter dialog, and `nemesis-shell { filter: blur(0) }` trapped the
// Nemesis sheets so they grew up under the header. To dodge every such trap the
// backdrop physically re-parents itself to <app-root> (the same box the app's
// lock-screen / consent dialogs already position against — see app.scss), where
// no such ancestor exists. From there `position: absolute; inset: 0` covers the
// full screen and `--keyboard-height` padding lifts content clear of the
// on-screen keyboard.
@Component({
    selector: 'app-overlay',
    standalone: true,
    templateUrl: './overlay.component.html',
    styleUrl: './overlay.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class OverlayComponent implements AfterViewInit, OnDestroy {
    readonly variant = input<OverlayVariant>('dialog');
    readonly dismissOnBackdrop = input(true);

    readonly dismissed = output<void>();

    private readonly document = inject(DOCUMENT);
    private readonly backdropRef = viewChild.required<ElementRef<HTMLElement>>('backdrop');

    private backdropEl?: HTMLElement;

    get element(): HTMLElement | undefined {
        return this.backdropEl;
    }

    ngAfterViewInit(): void {
        this.backdropEl = this.backdropRef().nativeElement;
        const target = this.document.querySelector('app-root') ?? this.document.body;
        target.appendChild(this.backdropEl);
    }

    // The backdrop is re-parented out of this component's host, so destroying the
    // host no longer takes it down. Remove it explicitly to avoid orphaning it in
    // <app-root>.
    ngOnDestroy(): void {
        this.backdropEl?.remove();
    }

    protected onBackdropClick(event: MouseEvent): void {
        if (event.target !== event.currentTarget) return;
        if (!this.dismissOnBackdrop()) return;
        this.dismissed.emit();
    }

    @HostListener('document:keydown.escape')
    protected onEscape(): void {
        this.dismissed.emit();
    }
}
