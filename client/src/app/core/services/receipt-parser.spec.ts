import { describe, expect, it } from 'vitest';
import {
    extractAmounts,
    normalizeAmount,
    parseReceiptAmount,
    parseReceiptDate,
    parseReceiptMerchant,
} from './receipt-parser';

describe('normalizeAmount', () => {
    it('reads German thousands + comma decimal', () => {
        expect(normalizeAmount('1.234,56')).toBe(1234.56);
    });

    it('reads English thousands + dot decimal', () => {
        expect(normalizeAmount('1,234.56')).toBe(1234.56);
    });

    it('reads a plain comma decimal', () => {
        expect(normalizeAmount('12,50')).toBe(12.5);
    });

    it('reads a plain dot decimal', () => {
        expect(normalizeAmount('12.50')).toBe(12.5);
    });

    it('reads a four-digit integer part without a thousands separator', () => {
        expect(normalizeAmount('1234,56')).toBe(1234.56);
    });

    it('treats a comma with three trailing digits as a thousands separator', () => {
        expect(normalizeAmount('1,234')).toBe(1234);
    });

    it('rejects non-numeric input', () => {
        expect(normalizeAmount('abc')).toBeNull();
    });
});

describe('extractAmounts', () => {
    it('ignores dates and times but keeps real amounts', () => {
        expect(extractAmounts('18.07.2026 14:32 Betrag 19,90')).toEqual([19.9]);
    });

    it('returns every amount on a line', () => {
        expect(extractAmounts('2x 4,50 9,00')).toEqual([4.5, 9.0]);
    });
});

describe('parseReceiptAmount', () => {
    it('picks the German total over subtotal and VAT', () => {
        const text = [
            'REWE Markt GmbH',
            'Zwischensumme    18,40',
            'MwSt 7%           1,20',
            'SUMME            19,90',
            'Gegeben          20,00',
            'Rückgeld          0,10',
        ].join('\n');
        expect(parseReceiptAmount(text, 'deu')).toBe(19.9);
    });

    it('handles German thousands separator on the total', () => {
        const text = 'Artikel\nGESAMT 1.234,56\nMwSt 197,53';
        expect(parseReceiptAmount(text, 'deu')).toBe(1234.56);
    });

    it('picks the French total and ignores TVA and rendu', () => {
        const text = [
            'Boulangerie',
            'TVA 5,5%          0,80',
            'TOTAL            15,30',
            'Espèces          20,00',
            'Rendu             4,70',
        ].join('\n');
        expect(parseReceiptAmount(text, 'fra')).toBe(15.3);
    });

    it('picks the Spanish total over subtotal', () => {
        const text = 'Bar Pepe\nSubtotal 10,00\nIVA 2,10\nTOTAL 12,10';
        expect(parseReceiptAmount(text, 'spa')).toBe(12.1);
    });

    it('picks the Italian totale', () => {
        const text = 'Trattoria\nIVA 22%\nTOTALE 42,00\nContanti 50,00';
        expect(parseReceiptAmount(text, 'ita')).toBe(42.0);
    });

    it('picks the English total', () => {
        const text = 'Coffee Shop\nSubtotal 8.00\nTax 0.64\nTOTAL 8.64';
        expect(parseReceiptAmount(text, 'eng')).toBe(8.64);
    });

    it('falls back to the largest lower amount when no keyword is present', () => {
        const text = 'Kiosk\nCola 2,50\nWasser 1,00\n7,90';
        expect(parseReceiptAmount(text, 'deu')).toBe(7.9);
    });

    it('returns null when there are no amounts', () => {
        expect(parseReceiptAmount('Danke für Ihren Einkauf', 'deu')).toBeNull();
    });
});

describe('parseReceiptDate', () => {
    it('normalizes a German date to ISO', () => {
        expect(parseReceiptDate('Datum 18.07.2026')).toBe('2026-07-18');
    });

    it('expands a two-digit year', () => {
        expect(parseReceiptDate('05/03/24')).toBe('2024-03-05');
    });

    it('returns null when no date is present', () => {
        expect(parseReceiptDate('SUMME 10,00')).toBeNull();
    });
});

describe('parseReceiptMerchant', () => {
    it('returns the top merchant line, not a total line', () => {
        const text = 'REWE Markt GmbH\nHauptstr. 1\nSUMME 19,90';
        expect(parseReceiptMerchant(text, 'deu')).toBe('REWE Markt GmbH');
    });

    it('skips numeric-heavy lines', () => {
        const text = '12345 6789\nCafé Central\nTOTAL 4,20';
        expect(parseReceiptMerchant(text, 'deu')).toBe('Café Central');
    });
});
