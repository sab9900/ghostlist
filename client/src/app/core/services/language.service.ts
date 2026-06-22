import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { PrefsCacheService } from './prefs-cache.service';

export interface Language {
    code: string;
    label: string;
}

const LANG_KEY = 'gl_lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
    private readonly translate = inject(TranslateService);
    private readonly prefsCache = inject(PrefsCacheService);

    static readonly SUPPORTED: Language[] = [
        { code: 'en_US', label: 'English' },
        { code: 'de_DE', label: 'Deutsch' },
        { code: 'it_IT', label: 'Italiano' },
        { code: 'es_ES', label: 'Español' },
        { code: 'fr_FR', label: 'Français' },
    ];

    // Seeded with a browser-language guess: this runs at construction time,
    // which may be before the IndexedDB preference cache (warmed by another,
    // concurrently-running app initializer) has resolved. init() below
    // corrects it from the actual stored preference before translations are
    // loaded, so this initial value is never actually rendered.
    readonly currentLang = signal(this.detectBrowserLang());

    async init(): Promise<void> {
        await this.prefsCache.ready();
        const stored = this.prefsCache.get<string | null>(LANG_KEY, null);
        if (stored) this.currentLang.set(stored);
        await firstValueFrom(this.translate.use(this.currentLang()));
    }

    async setLanguage(code: string): Promise<void> {
        this.currentLang.set(code);
        this.prefsCache.set(LANG_KEY, code);
        await firstValueFrom(this.translate.use(code));
    }

    private detectBrowserLang(): string {
        const browser = navigator.language.replace('-', '_');
        const codes = LanguageService.SUPPORTED.map(l => l.code);
        return (
            codes.find(c => c === browser) ??
            codes.find(c => c.startsWith(browser.split('_')[0])) ??
            'en_US'
        );
    }
}
