import { effect, Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light' | 'system';
export type ThemeAccent = 'violet' | 'cyan' | 'red' | 'noir';

const ACCENT_KEY = 'gl_accent';

const BG_BY_RESOLVED_THEME: Record<'dark' | 'light', string> = {
    dark: '#0e0e10',
    light: '#f4f4f6',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
    readonly theme = signal<Theme>(
        (localStorage.getItem('theme') as Theme | null) ?? 'system',
    );

    readonly accent = signal<ThemeAccent>(
        (localStorage.getItem(ACCENT_KEY) as ThemeAccent | null) ?? 'violet',
    );

    private readonly systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)');

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
            this.syncThemeColorMeta();
        });

        this.systemPrefersLight.addEventListener('change', () => {
            if (this.theme() === 'system') this.syncThemeColorMeta();
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

    private resolveTheme(): 'dark' | 'light' {
        const t = this.theme();
        if (t === 'system') return this.systemPrefersLight.matches ? 'light' : 'dark';
        return t;
    }

    private syncThemeColorMeta(): void {
        const meta = document.querySelector('meta[name="theme-color"]');
        meta?.setAttribute('content', BG_BY_RESOLVED_THEME[this.resolveTheme()]);
    }
}
