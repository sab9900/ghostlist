import { Injectable } from '@angular/core';

const PDFJS_VERSION = '5.4.149';
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

interface PdfJsViewport {
    width: number;
    height: number;
}

interface PdfJsPage {
    getViewport(params: { scale: number }): PdfJsViewport;
    render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }): { promise: Promise<void> };
}

interface PdfJsDocument {
    getPage(pageNumber: number): Promise<PdfJsPage>;
}

interface PdfJsLib {
    getDocument(params: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
    GlobalWorkerOptions: { workerSrc: string };
}

@Injectable({ providedIn: 'root' })
export class PdfRenderService {
    private libPromise: Promise<PdfJsLib> | null = null;

    // pdf.js is only ever needed when a user shares/uploads a PDF receipt, so — same as
    // Tesseract.js in OcrService — it is loaded lazily from a CDN as an ES module at runtime
    // instead of being bundled, keeping it out of the main app bundle entirely.
    async renderFirstPageToBlob(file: Blob, maxDimension = 1600): Promise<Blob> {
        const pdfjsLib = await this.ensurePdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await doc.getPage(1);

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(maxDimension / baseViewport.width, maxDimension / baseViewport.height);
        const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas wird nicht unterstützt');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                blob => (blob ? resolve(blob) : reject(new Error('PDF-Seite konnte nicht gerendert werden'))),
                'image/jpeg',
                0.92,
            );
        });
    }

    private ensurePdfJs(): Promise<PdfJsLib> {
        if (this.libPromise) return this.libPromise;

        this.libPromise = (async () => {
            const url = PDFJS_URL;
            const mod = await import(/* @vite-ignore */ url) as PdfJsLib;
            mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            return mod;
        })();

        return this.libPromise;
    }
}
