import { inject, Injectable } from '@angular/core';
import { LanguageService } from './language.service';
import { parseReceiptAmount, parseReceiptDate, parseReceiptMerchant } from './receipt-parser';
import { OcrEngineResult } from './ocr-engine';
import { TesseractOcrEngine } from './tesseract-ocr.engine';
import { NativeOcrEngine } from './native-ocr.engine';

export interface OcrWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    isAmount?: boolean;
}

export interface OcrResult {
    text: string;
    confidence: number;
    words: OcrWord[];
    detectedAmount: number | null;
    detectedDate: string | null;
}

// Engine-agnostic orchestrator: picks the native on-device engine when it is available (Capacitor + plugin
// synced) and otherwise the bundled Tesseract engine. It owns the concerns both engines share — serialising
// scans so a second call can't overtake the first, and turning raw OCR text into amount/date/merchant.
@Injectable({ providedIn: 'root' })
export class OcrService {
    private readonly language = inject(LanguageService);
    private readonly tesseract = inject(TesseractOcrEngine);
    private readonly native = inject(NativeOcrEngine);

    private queue: Promise<void> = Promise.resolve();

    private readonly LOCALE_TO_TESSERACT: Record<string, string> = {
        en_US: 'eng',
        de_DE: 'deu',
        it_IT: 'ita',
        es_ES: 'spa',
        fr_FR: 'fra',
    };

    prewarm(): void {
        const lang = this.tesseractLang();
        (this.native.isAvailable() ? this.native : this.tesseract).prewarm(lang);
    }

    async scan(imageBlob: Blob): Promise<OcrResult> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>(res => { release = res; });
        await previous;

        try {
            const lang = this.tesseractLang();
            const raw = await this.recognize(imageBlob, lang);
            const text = raw.text;
            const detectedAmount = parseReceiptAmount(text, lang);
            const detectedDate = parseReceiptDate(text);
            const amountStr = detectedAmount !== null ? String(detectedAmount) : null;

            const words: OcrWord[] = raw.words.map(w => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox,
                isAmount: amountStr !== null && w.text.replace(/[€$£¥,]/g, '.').includes(amountStr),
            }));

            return { text, confidence: raw.confidence, words, detectedAmount, detectedDate };
        } finally {
            release();
        }
    }

    private async recognize(imageBlob: Blob, lang: string): Promise<OcrEngineResult> {
        if (this.native.isAvailable()) {
            try {
                return await this.native.recognize(imageBlob, lang);
            } catch {
            }
        }
        return this.tesseract.recognize(imageBlob, lang);
    }

    extractDescription(text: string): string | null {
        return parseReceiptMerchant(text, this.tesseractLang());
    }

    private tesseractLang(): string {
        return this.LOCALE_TO_TESSERACT[this.language.currentLang()] ?? 'eng';
    }
}
