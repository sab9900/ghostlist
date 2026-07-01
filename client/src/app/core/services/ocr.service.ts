import { Injectable } from '@angular/core';

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
}

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

interface TesseractGlobal {
    createWorker(langs: string, oem?: number, options?: object): Promise<TesseractWorker>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}

@Injectable({ providedIn: 'root' })
export class OcrService {
    private loadPromise: Promise<void> | null = null;
    private worker: TesseractWorker | null = null;
    private workerInitPromise: Promise<TesseractWorker> | null = null;

    // The live scanner overlay and the final post-capture pass can both call scan() around the
    // same time, but a single Tesseract worker can only run one recognize() job at a time — firing
    // a second call while the first is still in flight is what used to make the "Analysiere…"
    // spinner hang forever. This queue chain forces every scan() call to wait its turn.
    private queue: Promise<void> = Promise.resolve();

    // Generous — first use also downloads the eng+deu language data, which can take a while on
    // a slow connection. Once the worker is warm, subsequent scan() calls skip straight to recognize().
    private readonly LOAD_TIMEOUT_MS = 30_000;
    private readonly RECOGNIZE_TIMEOUT_MS = 20_000;

    async scan(imageBlob: Blob): Promise<OcrResult> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>(res => { release = res; });
        await previous;

        try {
            const worker = await withTimeout(this.getWorker(), this.LOAD_TIMEOUT_MS, 'OCR-Engine konnte nicht geladen werden');
            const result = await withTimeout(worker.recognize(imageBlob), this.RECOGNIZE_TIMEOUT_MS, 'OCR-Analyse hat zu lange gedauert');
            const text = result.data.text.trim();
            const detectedAmount = this.parseAmount(text);
            const amountStr = detectedAmount !== null ? String(detectedAmount) : null;

            const words: OcrWord[] = result.data.words.map(w => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox,
                isAmount: amountStr !== null && w.text.replace(/[€$£¥,]/g, '.').includes(amountStr),
            }));

            return { text, confidence: result.data.confidence, words, detectedAmount };
        } finally {
            release();
        }
    }

    extractDescription(text: string): string | null {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            const letters = (line.match(/[a-zA-ZäöüÄÖÜß]/g) ?? []).length;
            if (line.length >= 3 && letters / line.length > 0.5) {
                return line.length > 40 ? line.slice(0, 40).trimEnd() + '…' : line;
            }
        }
        return null;
    }

    private async getWorker(): Promise<TesseractWorker> {
        if (this.worker) return this.worker;
        if (this.workerInitPromise) return this.workerInitPromise;
        this.workerInitPromise = this.createWorker();
        this.worker = await this.workerInitPromise;
        return this.worker;
    }

    private async createWorker(): Promise<TesseractWorker> {
        await this.ensureTesseract();
        const T = (window as unknown as { Tesseract: TesseractGlobal }).Tesseract;
        return T.createWorker('eng+deu', 1, {
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
            logger: () => {},
        });
    }

    private ensureTesseract(): Promise<void> {
        const win = window as unknown as { Tesseract?: TesseractGlobal };
        if (win.Tesseract) return Promise.resolve();
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = new Promise<void>((resolve, reject) => {
            const existing = document.querySelector('script[src*="tesseract.js"]');
            if (existing) {
                const poll = setInterval(() => {
                    if ((window as unknown as { Tesseract?: unknown }).Tesseract) {
                        clearInterval(poll);
                        resolve();
                    }
                }, 50);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Tesseract.js konnte nicht geladen werden'));
            document.head.appendChild(script);
        });

        return this.loadPromise;
    }

    private parseAmount(text: string): number | null {
        const patterns = [
            /total[:\s]+([€$£¥]?\s*[\d.,]+)/i,
            /gesamt[:\s]+([€$£¥]?\s*[\d.,]+)/i,
            /betrag[:\s]+([€$£¥]?\s*[\d.,]+)/i,
            /summe[:\s]+([€$£¥]?\s*[\d.,]+)/i,
            /([€$£¥]\s*[\d.,]+)/,
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match?.[1]) {
                const cleaned = match[1].replace(/[€$£¥\s]/g, '').replace(',', '.');
                const parsed = parseFloat(cleaned);
                if (!isNaN(parsed)) return parsed;
            }
        }

        return null;
    }
}
