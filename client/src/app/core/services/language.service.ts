import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

export interface Language {
    code: string;
    label: string;
}

const LANG_KEY = 'gl_lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
    private readonly translate = inject(TranslateService);

    static readonly SUPPORTED: Language[] = [
        { code: 'en_US', label: 'English (US)' },
        { code: 'de_DE', label: 'Deutsch' },
        { code: 'it_IT', label: 'Italiano' },
        { code: 'es_ES', label: 'Español' },
    ];

    readonly currentLang = signal(this.detectLang());

    /** Called once at app startup via provideAppInitializer. */
    async init(): Promise<void> {
        await firstValueFrom(this.translate.use(this.currentLang()));
    }

    async setLanguage(code: string): Promise<void> {
        this.currentLang.set(code);
        try { localStorage.setItem(LANG_KEY, code); } catch { /* */ }
        await firstValueFrom(this.translate.use(code));
    }

    private detectLang(): string {
        try {
            const stored = localStorage.getItem(LANG_KEY);
            if (stored) return stored;
        } catch { /* */ }
        const browser = navigator.language.replace('-', '_');
        const codes = LanguageService.SUPPORTED.map(l => l.code);
        return (
            codes.find(c => c === browser) ??
            codes.find(c => c.startsWith(browser.split('_')[0])) ??
            'en_US'
        );
    }
}
