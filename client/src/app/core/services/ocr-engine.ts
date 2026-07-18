export interface OcrBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface OcrEngineWord {
    text: string;
    confidence: number;
    bbox: OcrBox;
}

export interface OcrEngineResult {
    text: string;
    confidence: number;
    words: OcrEngineWord[];
}

export interface OcrEngine {
    isAvailable(): boolean;
    prewarm(lang: string): void;
    recognize(image: Blob, lang: string): Promise<OcrEngineResult>;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}
