import { Directive, ElementRef, HostListener, inject } from '@angular/core';

@Directive({
    selector: 'input[appDecimalInput]',
    standalone: true,
})
export class DecimalInputDirective {
    private readonly el = inject(ElementRef<HTMLInputElement>);

    @HostListener('focus')
    onFocus(): void {
        const input = this.el.nativeElement;
        if (input.value === '') return;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    @HostListener('keypress', ['$event'])
    onKeyPress(event: KeyboardEvent): void {
        const input = this.el.nativeElement;
        if (event.key === '.' && !input.value.includes('.')) return;
        if (/^[0-9]$/.test(event.key)) return;
        event.preventDefault();
    }

    @HostListener('paste', ['$event'])
    onPaste(event: ClipboardEvent): void {
        event.preventDefault();
        const pasted = event.clipboardData?.getData('text') ?? '';
        const sanitized = this.sanitize(pasted);
        if (!sanitized) return;

        const input = this.el.nativeElement;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + sanitized + input.value.slice(end);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    private sanitize(value: string): string {
        const digitsAndDots = value.replace(/[^0-9.]/g, '');
        const [whole, ...rest] = digitsAndDots.split('.');
        return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
    }
}
