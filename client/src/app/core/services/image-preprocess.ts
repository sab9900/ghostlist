export interface FittedSize {
    width: number;
    height: number;
    scale: number;
}

export interface PreprocessResult {
    blob: Blob;
    scale: number;
}

export function fitDimensions(width: number, height: number, maxDim: number): FittedSize {
    const longEdge = Math.max(width, height);
    if (longEdge <= maxDim || longEdge === 0) return { width, height, scale: 1 };
    const ratio = maxDim / longEdge;
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
        scale: 1 / ratio,
    };
}

export function toGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    }
    return gray;
}

// Adaptive-mean threshold via an integral image: each pixel is compared against the local mean of a
// window around it, so uneven lighting across a phone photo of a receipt doesn't wash out whole regions
// the way a single global threshold would. k pulls the cutoff slightly below the mean to keep thin strokes.
export function adaptiveThreshold(
    gray: Float32Array,
    width: number,
    height: number,
    window = 0,
    k = 0.15,
): Uint8Array {
    const out = new Uint8Array(width * height);
    if (width === 0 || height === 0) return out;

    const win = window > 0 ? window : Math.max(15, Math.floor(Math.min(width, height) / 20)) | 1;
    const half = win >> 1;

    const iw = width + 1;
    const integral = new Float64Array(iw * (height + 1));
    for (let y = 0; y < height; y++) {
        let rowSum = 0;
        for (let x = 0; x < width; x++) {
            rowSum += gray[y * width + x];
            integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
        }
    }

    for (let y = 0; y < height; y++) {
        const y0 = Math.max(0, y - half);
        const y1 = Math.min(height - 1, y + half);
        for (let x = 0; x < width; x++) {
            const x0 = Math.max(0, x - half);
            const x1 = Math.min(width - 1, x + half);
            const area = (x1 - x0 + 1) * (y1 - y0 + 1);
            const sum =
                integral[(y1 + 1) * iw + (x1 + 1)] -
                integral[y0 * iw + (x1 + 1)] -
                integral[(y1 + 1) * iw + x0] +
                integral[y0 * iw + x0];
            const mean = sum / area;
            out[y * width + x] = gray[y * width + x] < mean * (1 - k) ? 0 : 255;
        }
    }
    return out;
}

async function loadBitmap(blob: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        return {
            width: bitmap.width,
            height: bitmap.height,
            draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        };
    }
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
            el.src = url;
        });
        return {
            width: img.naturalWidth,
            height: img.naturalHeight,
            draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function preprocessForOcr(blob: Blob, maxDim = 1800): Promise<PreprocessResult> {
    const source = await loadBitmap(blob);
    const fitted = fitDimensions(source.width, source.height, maxDim);

    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { blob, scale: 1 };

    source.draw(ctx, fitted.width, fitted.height);
    const image = ctx.getImageData(0, 0, fitted.width, fitted.height);

    const gray = toGrayscale(image.data, fitted.width, fitted.height);
    const binary = adaptiveThreshold(gray, fitted.width, fitted.height);

    for (let i = 0, p = 0; i < binary.length; i++, p += 4) {
        image.data[p] = image.data[p + 1] = image.data[p + 2] = binary[i];
        image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    const out = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
    return out ? { blob: out, scale: fitted.scale } : { blob, scale: 1 };
}
