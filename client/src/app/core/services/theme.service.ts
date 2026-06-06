import { effect, Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    readonly theme = signal<Theme>(
        (localStorage.getItem('theme') as Theme | null) ?? 'system',
    );

    constructor() {
        effect(() => {
            const t = this.theme();
            localStorage.setItem('theme', t);
            const html = document.documentElement;
            if (t === 'system') {
                html.removeAttribute('data-theme');
            } else {
                html.setAttribute('data-theme', t);
            }
        });
    }

    set(theme: Theme): void {
        this.theme.set(theme);
    }
}
