import { Injectable } from '@angular/core';
import { OcrEngine, OcrEngineResult, OcrEngineWord, withTimeout } from './ocr-engine';
import { preprocessForOcr } from './image-preprocess';

interface TesseractWorker {
    recognize(image: Blob | string): Promise<{
        data: {
            text: string;
            confidence: number;
            words: Array<{
                text: string;
                confidence: number;
                bbox: { x0: number; y0: number; x1: number; y1: number };
            }>;
        };
    }>;
    terminate(): Promise<void>;
}

function assetUrl(path: string): string {
    return new URL(path, document.baseURI).href;
}

// Web/PWA fallback engine. Engine, wasm-Core und die Sprachdaten kommen lokal aus /tesseract (kein CDN);
// es wird immer nur die traineddata der gewuenschten Sprache geladen (lazy) und der Worker bleibt warm,
// bis sich die Sprache aendert. Vor der Erkennung wird das Bild binarisiert (image-preprocess) und die
// Wort-Boxen werden anschliessend auf die Originalaufloesung zurueckskaliert.
@Injectable({ providedIn: 'root' })
export class TesseractOcrEngine implements OcrEngine {
    private workerInitPromise: Promise<TesseractWorker> | null = null;
    private workerLang: string | null = null;

    private readonly LOAD_TIMEOUT_MS = 30_000;
    private readonly RECOGNIZE_TIMEOUT_MS = 20_000;

    isAvailable(): boolean {
        return true;
    }

    prewarm(lang: string): void {
        void this.getWorker(lang).catch(() => { });
    }

    async recognize(image: Blob, lang: string): Promise<OcrEngineResult> {
        const worker = await withTimeout(this.getWorker(lang), this.LOAD_TIMEOUT_MS, 'OCR-Engine konnte nicht geladen werden');
        const { blob, scale } = await this.preprocess(image);
        const result = await withTimeout(worker.recognize(blob), this.RECOGNIZE_TIMEOUT_MS, 'OCR-Analyse hat zu lange gedauert');

        const words: OcrEngineWord[] = result.data.words.map(w => ({
            text: w.text,
            confidence: w.confidence,
            bbox: {
                x0: w.bbox.x0 * scale,
                y0: w.bbox.y0 * scale,
                x1: w.bbox.x1 * scale,
                y1: w.bbox.y1 * scale,
            },
        }));

        return { text: result.data.text.trim(), confidence: result.data.confidence, words };
    }

    private async preprocess(image: Blob): Promise<{ blob: Blob; scale: number }> {
        try {
            return await preprocessForOcr(image);
        } catch {
            return { blob: image, scale: 1 };
        }
    }

    private getWorker(lang: string): Promise<TesseractWorker> {
        if (this.workerInitPromise && this.workerLang === lang) return this.workerInitPromise;
        const previous = this.workerInitPromise;
        this.workerLang = lang;
        this.workerInitPromise = this.recreateWorker(previous, lang);
        return this.workerInitPromise;
    }

    private async recreateWorker(previous: Promise<TesseractWorker> | null, lang: string): Promise<TesseractWorker> {
        if (previous) {
            try {
                await (await previous).terminate();
            } catch {
            }
        }
        return this.createWorker(lang);
    }

    private async createWorker(lang: string): Promise<TesseractWorker> {
        const { createWorker } = await import('tesseract.js');
        return createWorker(lang, 1, {
            workerPath: assetUrl('tesseract/worker.min.js'),
            corePath: assetUrl('tesseract/'),
            langPath: assetUrl('tesseract/lang'),
            logger: () => { },
        }) as unknown as Promise<TesseractWorker>;
    }
}
