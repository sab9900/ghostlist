import { effect, Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light' | 'system';
export type ThemeAccent = 'violet' | 'cyan' | 'red' | 'noir';

const ACCENT_KEY = 'gl_accent';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    readonly theme = signal<Theme>(
        (localStorage.getItem('theme') as Theme | null) ?? 'system',
    );

    readonly accent = signal<ThemeAccent>(
        (localStorage.getItem(ACCENT_KEY) as ThemeAccent | null) ?? 'violet',
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

        effect(() => {
            const a = this.accent();
            const html = document.documentElement;
            if (a === 'violet') {
                html.removeAttribute('data-accent');
                localStorage.removeItem(ACCENT_KEY);
            } else {
                html.setAttribute('data-accent', a);
                localStorage.setItem(ACCENT_KEY, a);
            }
        });
    }

    set(theme: Theme): void {
        this.theme.set(theme);
    }

    setAccent(accent: ThemeAccent): void {
        this.accent.set(accent);
    }
}
