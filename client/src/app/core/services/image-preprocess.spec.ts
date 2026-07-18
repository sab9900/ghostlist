import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, fitDimensions, toGrayscale } from './image-preprocess';

describe('fitDimensions', () => {
    it('leaves images within the limit untouched', () => {
        expect(fitDimensions(800, 600, 1800)).toEqual({ width: 800, height: 600, scale: 1 });
    });

    it('scales the long edge down to the limit', () => {
        const fitted = fitDimensions(3600, 2400, 1800);
        expect(fitted.width).toBe(1800);
        expect(fitted.height).toBe(1200);
        expect(fitted.scale).toBeCloseTo(2);
    });

    it('scale maps processed coordinates back to the original', () => {
        const fitted = fitDimensions(3600, 2400, 1800);
        expect(900 * fitted.scale).toBeCloseTo(1800);
    });

    it('handles a zero-sized image without dividing by zero', () => {
        expect(fitDimensions(0, 0, 1800)).toEqual({ width: 0, height: 0, scale: 1 });
    });
});

describe('toGrayscale', () => {
    it('maps pure white and pure black correctly', () => {
        const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
        const gray = toGrayscale(rgba, 2, 1);
        expect(gray[0]).toBeCloseTo(255);
        expect(gray[1]).toBeCloseTo(0);
    });

    it('weights green most heavily', () => {
        const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
        const gray = toGrayscale(rgba, 2, 1);
        expect(gray[1]).toBeGreaterThan(gray[0]);
    });
});

describe('adaptiveThreshold', () => {
    it('binarises output to only 0 or 255', () => {
        const width = 8;
        const height = 8;
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) gray[i] = (i * 37) % 256;
        const out = adaptiveThreshold(gray, width, height);
        expect(out.every(v => v === 0 || v === 255)).toBe(true);
    });

    it('keeps dark text darker than its bright surround', () => {
        const width = 9;
        const height = 9;
        const gray = new Float32Array(width * height).fill(220);
        const center = 4 * width + 4;
        gray[center] = 20;
        const out = adaptiveThreshold(gray, width, height, 5, 0.15);
        expect(out[center]).toBe(0);
        expect(out[0]).toBe(255);
    });
});
