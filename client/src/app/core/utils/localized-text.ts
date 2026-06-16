
const FALLBACK_LANG = 'en_US';

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
