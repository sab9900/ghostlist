/**
 * Compares two dot-separated numeric version strings (e.g. "0.1.10" vs "0.1.9").
 * Returns a negative number if `a` < `b`, 0 if equal, and a positive number if `a` > `b`.
 * Missing/non-numeric segments are treated as 0, so "1.2" === "1.2.0".
 */
export function compareVersions(a: string, b: string): number {
    const partsA = a.trim().split('.');
    const partsB = b.trim().split('.');
    const length = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < length; i++) {
        const numA = Number(partsA[i] ?? 0) || 0;
        const numB = Number(partsB[i] ?? 0) || 0;
        if (numA !== numB) return numA - numB;
    }

    return 0;
}
