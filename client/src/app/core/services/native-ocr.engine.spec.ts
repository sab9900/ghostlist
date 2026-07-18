import { describe, expect, it } from 'vitest';
import { mapMlkitResult } from './native-ocr.engine';

describe('mapMlkitResult', () => {
    it('flattens blocks/lines/elements into words with boundingBox boxes', () => {
        const result = mapMlkitResult({
            text: '  REWE\n19,90  ',
            blocks: [
                {
                    text: 'REWE 19,90',
                    lines: [
                        {
                            text: 'REWE 19,90',
                            elements: [
                                { text: 'REWE', boundingBox: { left: 10, top: 20, right: 50, bottom: 32 } },
                                { text: '19,90', boundingBox: { left: 60, top: 20, right: 90, bottom: 32 } },
                            ],
                        },
                    ],
                },
            ],
        });

        expect(result.text).toBe('REWE\n19,90');
        expect(result.words).toHaveLength(2);
        expect(result.words[0]).toMatchObject({ text: 'REWE', bbox: { x0: 10, y0: 20, x1: 50, y1: 32 } });
        expect(result.words[1].bbox).toEqual({ x0: 60, y0: 20, x1: 90, y1: 32 });
    });

    it('falls back to the line when it has no elements', () => {
        const result = mapMlkitResult({
            text: 'TOTAL',
            blocks: [{ text: 'TOTAL', lines: [{ text: 'TOTAL', boundingBox: { left: 0, top: 0, right: 50, bottom: 10 } }] }],
        });
        expect(result.words).toEqual([{ text: 'TOTAL', confidence: 95, bbox: { x0: 0, y0: 0, x1: 50, y1: 10 } }]);
    });

    it('derives a box from cornerPoints when no boundingBox is present', () => {
        const result = mapMlkitResult({
            text: 'A',
            blocks: [{
                text: 'A',
                lines: [{
                    text: 'A',
                    elements: [{ text: 'A', cornerPoints: [{ x: 5, y: 8 }, { x: 20, y: 8 }, { x: 20, y: 25 }, { x: 5, y: 25 }] }],
                }],
            }],
        });
        expect(result.words[0].bbox).toEqual({ x0: 5, y0: 8, x1: 20, y1: 25 });
    });

    it('skips nodes without text or geometry and tolerates empty input', () => {
        expect(mapMlkitResult({ text: '', blocks: [] }).words).toEqual([]);
        const noGeom = mapMlkitResult({
            text: 'x',
            blocks: [{ text: 'x', lines: [{ text: 'x', elements: [{ text: 'x' }] }] }],
        });
        expect(noGeom.words).toEqual([]);
    });
});
