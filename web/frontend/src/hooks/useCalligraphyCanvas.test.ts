/**
 * Tests for the calligraphy word-points sampler.
 *
 * useCalligraphyCanvas exports getWordPoints, which renders text to an
 * offscreen canvas and samples pixel positions where the text ink lands.
 *
 * jsdom does NOT implement the canvas 2D context — `getContext('2d')`
 * returns null. This means the full rendering pipeline can't run in
 * unit tests, but the early-return contract (no 2D context → []) MUST
 * hold so the consumer (CalligraphyLoader) degrades gracefully instead
 * of throwing. We pin that contract here.
 */

import { describe, expect, it } from 'vitest';

import { getWordPoints } from './useCalligraphyCanvas';

function _canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 200;
  return c;
}

describe('getWordPoints', () => {
  it('returns empty array when 2D context is unavailable', () => {
    // jsdom returns null for getContext('2d') — the function must
    // short-circuit and return [] rather than crash. CalligraphyLoader
    // depends on this graceful-degrade contract.
    const out = getWordPoints('hello', _canvas(), 62);
    expect(out).toEqual([]);
  });

  it('returns an array (typed for downstream consumption)', () => {
    // The contract is "Array<{x, y}>". Even with an empty array, the
    // shape must be an array — not undefined, null, or a thrown error.
    const out: Array<{ x: number; y: number }> = getWordPoints('hi', _canvas(), 32);
    expect(Array.isArray(out)).toBe(true);
  });
});
