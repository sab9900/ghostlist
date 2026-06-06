import {
    AfterViewInit,
    Component,
    ElementRef,
    Input,
    OnChanges,
    OnDestroy,
    ViewChild,
} from '@angular/core';

declare const QRCode: new (el: HTMLElement, opts: object) => { clear(): void };

@Component({
    selector: 'app-qr-code',
    templateUrl: './qr-code.component.html',
    styleUrl: './qr-code.component.scss',
})
export class QrCodeComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input({ required: true }) data!: string;
    @Input() size = 200;

    @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

    private qr: { clear(): void } | null = null;

    ngAfterViewInit(): void {
        this.render();
    }

    ngOnChanges(): void {
        if (this.containerRef) this.render();
    }

    ngOnDestroy(): void {
        this.qr?.clear();
    }

    private render(): void {
        const el = this.containerRef?.nativeElement;
        if (!el || !this.data) return;
        el.innerHTML = '';
        this.qr = new QRCode(el, {
            text: this.data,
            width: this.size,
            height: this.size,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: (QRCode as any).CorrectLevel?.M ?? 1,
        });
    }
}
