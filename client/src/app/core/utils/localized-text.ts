/** Fallback language used when the current language has no translation. */
const FALLBACK_LANG = 'en_US';

/**
 * Admin/CI broadcast messages (`InfoMessage.title` / `.body`) are normally
 * plain text. To support multi-language messages (e.g. the automated
 * Android release notification), a message's text can instead be a JSON
 * object mapping language codes to strings, e.g.:
 *
 * ```json
 * { "en_US": "Update available", "de_DE": "Update verfügbar" }
 * ```
 *
 * This resolves such a value to the string for `lang`, falling back to
 * English and then to any available translation. Plain text values (the
 * common case) are returned unchanged.
 */
export function resolveLocalizedText(value: string, lang: string): string {
    if (!value.trim().startsWith('{')) return value;

    try {
        const map = JSON.parse(value);
        if (typeof map !== 'object' || map === null || Array.isArray(map)) return value;

        return map[lang] ?? map[FALLBACK_LANG] ?? Object.values(map)[0] ?? value;
    } catch {
        return value;
    }
}
