
const PREFERRED_LANG = 'de_DE';
const FALLBACK_LANG = 'en_US';

export const SUPPORTED_LANGUAGES = ['en_US', 'de_DE', 'it_IT', 'es_ES'] as const;

export function isJsonObject(value: string): boolean {
    if (!value.trim().startsWith('{')) return false;
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
        return false;
    }
}

export function buildMultiLangTemplate(seedLang: string, seedValue: string): string {
    const map: Record<string, string> = {};
    for (const lang of SUPPORTED_LANGUAGES) {
        map[lang] = lang === seedLang ? seedValue : '';
    }
    return JSON.stringify(map, null, 2);
}

export function resolveLocalizedText(value: string): string {
    if (!value.trim().startsWith('{')) return value;

    try {
        const map = JSON.parse(value);
        if (typeof map !== 'object' || map === null || Array.isArray(map)) return value;

        return map[PREFERRED_LANG] ?? map[FALLBACK_LANG] ?? Object.values(map)[0] ?? value;
    } catch {
        return value;
    }
}
