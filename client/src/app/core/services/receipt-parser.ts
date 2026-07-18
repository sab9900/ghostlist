export interface ParsedReceipt {
    amount: number | null;
    date: string | null;
    merchant: string | null;
}

const TOTAL_KEYWORDS: Record<string, string[]> = {
    deu: ['ZU ZAHLEN', 'ZAHLBETRAG', 'GESAMTBETRAG', 'ENDBETRAG', 'GESAMT', 'SUMME', 'TOTAL', 'BETRAG', 'BRUTTO'],
    eng: ['GRAND TOTAL', 'TOTAL DUE', 'AMOUNT DUE', 'BALANCE DUE', 'TOTAL'],
    spa: ['TOTAL A PAGAR', 'A PAGAR', 'IMPORTE TOTAL', 'TOTAL', 'IMPORTE'],
    fra: ['NET A PAYER', 'A PAYER', 'TOTAL TTC', 'MONTANT DU', 'TOTAL', 'MONTANT'],
    ita: ['TOTALE COMPLESSIVO', 'TOTALE EURO', 'DA PAGARE', 'TOTALE', 'IMPORTO'],
};

const EXCLUDE_KEYWORDS: Record<string, string[]> = {
    deu: ['MWST', 'UST', 'ZWISCHENSUMME', 'RUCKGELD', 'GEGEBEN', 'BAR', 'TRINKGELD', 'STEUER'],
    eng: ['SUBTOTAL', 'SUB TOTAL', 'VAT', 'TAX', 'CHANGE', 'CASH', 'TENDERED', 'TIP'],
    spa: ['SUBTOTAL', 'IVA', 'CAMBIO', 'ENTREGADO', 'EFECTIVO', 'PROPINA'],
    fra: ['SOUS-TOTAL', 'SOUS TOTAL', 'TVA', 'RENDU', 'MONNAIE', 'ESPECES', 'POURBOIRE'],
    ita: ['SUBTOTALE', 'IVA', 'RESTO', 'CONTANTI', 'MANCIA'],
};

function deburr(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function keySet(map: Record<string, string[]>, lang: string): string[] {
    const primary = map[lang] ?? [];
    const rest = Object.entries(map).filter(([k]) => k !== lang).flatMap(([, v]) => v);
    return [...primary, ...rest];
}

function stripNonAmount(line: string): string {
    return line
        .replace(/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/g, ' ')
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
}

export function normalizeAmount(raw: string): number | null {
    const digits = raw.replace(/[^\d.,]/g, '');
    if (!digits) return null;

    const lastSep = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'));
    let s: string;
    if (lastSep < 0) {
        s = digits;
    } else {
        const decimalCount = digits.length - lastSep - 1;
        if (decimalCount === 1 || decimalCount === 2) {
            s = digits.slice(0, lastSep).replace(/[.,]/g, '') + '.' + digits.slice(lastSep + 1);
        } else {
            s = digits.replace(/[.,]/g, '');
        }
    }

    const value = parseFloat(s);
    if (isNaN(value) || value <= 0 || value >= 1_000_000) return null;
    return Math.round(value * 100) / 100;
}

const AMOUNT_RX = /\d[\d.,]*[.,]\d{2}(?!\d)/g;

export function extractAmounts(line: string): number[] {
    const cleaned = stripNonAmount(line);
    const out: number[] = [];
    for (const match of cleaned.matchAll(AMOUNT_RX)) {
        const value = normalizeAmount(match[0]);
        if (value !== null) out.push(value);
    }
    return out;
}

function lineHasKeyword(upper: string, keywords: string[]): boolean {
    return keywords.some(k => upper.includes(k));
}

export function parseReceiptAmount(text: string, lang: string): number | null {
    const totals = keySet(TOTAL_KEYWORDS, lang);
    const excludes = keySet(EXCLUDE_KEYWORDS, lang);
    const lines = text.split('\n');

    let keywordCandidate: number | null = null;
    let keywordIndex = -1;
    const fallback: { value: number; index: number }[] = [];

    lines.forEach((line, index) => {
        const upper = deburr(line).toUpperCase();
        const amounts = extractAmounts(line);
        if (amounts.length === 0) return;

        const isExcluded = lineHasKeyword(upper, excludes);
        const isTotal = !isExcluded && lineHasKeyword(upper, totals);
        const best = Math.max(...amounts);

        if (isTotal && index >= keywordIndex) {
            keywordCandidate = best;
            keywordIndex = index;
        }
        if (!isExcluded) fallback.push({ value: best, index });
    });

    if (keywordCandidate !== null) return keywordCandidate;
    if (fallback.length === 0) return null;

    const threshold = lines.length * 0.4;
    const lower = fallback.filter(f => f.index >= threshold);
    const pool = lower.length > 0 ? lower : fallback;
    return pool.reduce((max, f) => (f.value > max ? f.value : max), 0) || null;
}

const DATE_RX = /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/;

export function parseReceiptDate(text: string): string | null {
    const match = text.match(DATE_RX);
    if (!match) return null;
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) year = `20${year}`;
    const iso = `${year}-${month}-${day}`;
    return isNaN(Date.parse(iso)) ? null : iso;
}

export function parseReceiptMerchant(text: string, lang: string): string | null {
    const skip = new Set([...keySet(TOTAL_KEYWORDS, lang), ...keySet(EXCLUDE_KEYWORDS, lang)]);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6);

    for (const line of lines) {
        const upper = deburr(line).toUpperCase();
        if ([...skip].some(k => upper.includes(k))) continue;
        const letters = (line.match(/[\p{L}]/gu) ?? []).length;
        const digits = (line.match(/\d/g) ?? []).length;
        if (line.length >= 3 && letters >= 3 && letters > digits) {
            return line.length > 40 ? line.slice(0, 40).trimEnd() + '…' : line;
        }
    }
    return null;
}

export function parseReceipt(text: string, lang: string): ParsedReceipt {
    return {
        amount: parseReceiptAmount(text, lang),
        date: parseReceiptDate(text),
        merchant: parseReceiptMerchant(text, lang),
    };
}
