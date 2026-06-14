/** Preferred language for displaying multi-language messages in the admin UI. */
const PREFERRED_LANG = 'de_DE';
const FALLBACK_LANG = 'en_US';

/** Languages supported by the standard client (see its `LanguageService`). */
export const SUPPORTED_LANGUAGES = ['en_US', 'de_DE', 'it_IT', 'es_ES'] as const;

/** Returns true if `value` parses as a JSON object (not array/primitive). */
export function isJsonObject(value: string): boolean {
    if (!value.trim().startsWith('{')) return false;
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
        return false;
    }
}

/** Builds an empty multi-language JSON template, optionally seeding one language with existing text. */
export function buildMultiLangTemplate(seedLang: string, seedValue: string): string {
    const map: Record<string, string> = {};
    for (const lang of SUPPORTED_LANGUAGES) {
        map[lang] = lang === seedLang ? seedValue : '';
    }
    return JSON.stringify(map, null, 2);
}

/**
 * Broadcast messages (`InfoMessage.title` / `.body`) are normally plain text.
 * For multi-language messages (e.g. the automated Android release
 * notification), the value is instead a JSON object mapping language codes
 * to strings, e.g.:
 *
 * ```json
 * { "en_US": "Update available", "de_DE": "Update verfügbar" }
 * ```
 *
 * This resolves such a value to a readable string for display in the admin
 * UI (preferring German, then English, then any available translation).
 * Plain text values (the common case) are returned unchanged.
 */
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
