
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
