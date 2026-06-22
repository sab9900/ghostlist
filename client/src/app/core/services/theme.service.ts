import { effect, inject, Injectable, signal } from '@angular/core';
import { PrefsCacheService } from './prefs-cache.service';

export type Theme = 'dark' | 'light' | 'system';
export type ThemeAccent = 'violet' | 'cyan' | 'blue' | 'red' | 'copper' | 'gold' | 'green' | 'pink' | 'noir';

const ACCENT_KEY = 'gl_accent';

const BG_BY_RESOLVED_THEME: Record<'dark' | 'light', string> = {
    dark: '#0e0e10',
    light: '#f4f4f6',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
    private readonly prefsCache = inject(PrefsCacheService);

    /**
     * `theme` is deliberately kept in localStorage rather than IndexedDB.
     * The inline bootstrap script in index.html reads this key
     * synchronously — before Angular, and before any IndexedDB lookup
     * could possibly resolve — to paint the right background/theme-color
     * before first paint. IndexedDB has no synchronous read API, so moving
     * this value would reintroduce the flash-of-wrong-theme that script
     * exists to prevent.
     */
    readonly theme = signal<Theme>(
        (localStorage.getItem('theme') as Theme | null) ?? 'system',
    );

    readonly accent = signal<ThemeAccent>(
        this.prefsCache.get<ThemeAccent>(ACCENT_KEY, 'violet'),
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
                this.prefsCache.delete(ACCENT_KEY);
            } else {
                html.setAttribute('data-accent', a);
                this.prefsCache.set(ACCENT_KEY, a);
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
