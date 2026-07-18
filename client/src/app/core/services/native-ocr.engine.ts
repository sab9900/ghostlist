import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { OcrBox, OcrEngine, OcrEngineResult, OcrEngineWord, withTimeout } from './ocr-engine';

interface MlkitRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface MlkitPoint {
    x: number;
    y: number;
}

interface MlkitNode {
    text: string;
    boundingBox?: MlkitRect;
    cornerPoints?: MlkitPoint[];
}

interface MlkitLine extends MlkitNode {
    elements?: MlkitNode[];
}

interface MlkitBlock extends MlkitNode {
    lines?: MlkitLine[];
}

interface MlkitResult {
    text: string;
    blocks?: MlkitBlock[];
}

interface TextRecognitionPlugin {
    processImage(options: { path: string }): Promise<MlkitResult>;
}

const PLUGIN_NAME = 'TextRecognition';
const NATIVE_CONFIDENCE = 95;
const RECOGNIZE_TIMEOUT_MS = 15_000;

// Bound lazily to the native @capacitor-mlkit/text-recognition implementation. registerPlugin needs no npm
// JS dependency in the web bundle — the proxy resolves to the native plugin at call time once it has been
// added to the native project and synced (npx cap sync). On web there is no implementation, which is why
// isAvailable() gates every call.
const TextRecognition = registerPlugin<TextRecognitionPlugin>(PLUGIN_NAME);

function boxFrom(node: MlkitNode): OcrBox | null {
    if (node.boundingBox) {
        const { left, top, right, bottom } = node.boundingBox;
        return { x0: left, y0: top, x1: right, y1: bottom };
    }
    if (node.cornerPoints && node.cornerPoints.length > 0) {
        const xs = node.cornerPoints.map(p => p.x);
        const ys = node.cornerPoints.map(p => p.y);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
    return null;
}

// Flattens the ML Kit block/line/element tree into the flat word list the Tesseract engine also returns, so
// the rest of the pipeline (amount/date parsing, overlay boxes) is engine-agnostic. ML Kit frames are already
// in original-image pixels, so no rescaling is needed. Pure + unit-tested.
export function mapMlkitResult(result: MlkitResult): OcrEngineResult {
    const words: OcrEngineWord[] = [];
    for (const block of result.blocks ?? []) {
        for (const line of block.lines ?? []) {
            const elements = line.elements ?? [];
            const nodes: MlkitNode[] = elements.length > 0 ? elements : [line];
            for (const node of nodes) {
                const bbox = boxFrom(node);
                if (!bbox || !node.text) continue;
                words.push({ text: node.text, confidence: NATIVE_CONFIDENCE, bbox });
            }
        }
    }
    return { text: (result.text ?? '').trim(), confidence: NATIVE_CONFIDENCE, words };
}

// On-device native OCR (Android ML Kit / iOS Vision). Everything stays on the device — no plaintext leaves it,
// so the zero-knowledge guarantee holds. If the plugin has not been added/synced, isAvailable() is false and
// OcrService falls back to Tesseract.
@Injectable({ providedIn: 'root' })
export class NativeOcrEngine implements OcrEngine {
    isAvailable(): boolean {
        return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN_NAME);
    }

    prewarm(): void {
    }

    async recognize(image: Blob, _lang: string): Promise<OcrEngineResult> {
        const path = await this.writeToCache(image);
        try {
            const result = await withTimeout(
                TextRecognition.processImage({ path }),
                RECOGNIZE_TIMEOUT_MS,
                'Native OCR-Analyse hat zu lange gedauert',
            );
            return mapMlkitResult(result);
        } finally {
            void this.deleteFromCache(path);
        }
    }

    private async writeToCache(image: Blob): Promise<string> {
        const data = await blobToBase64(image);
        const path = `ocr-${Date.now()}.jpg`;
        await Filesystem.writeFile({ path, data, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
        return uri;
    }

    private async deleteFromCache(uri: string): Promise<void> {
        try {
            const path = uri.split('/').pop();
            if (path) await Filesystem.deleteFile({ path, directory: Directory.Cache });
        } catch {
        }
    }
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
        reader.readAsDataURL(blob);
    });
}
