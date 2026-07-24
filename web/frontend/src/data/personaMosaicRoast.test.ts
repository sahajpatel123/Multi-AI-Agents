/**
 * Tests for Persona Mosaic Roast data + scoring engine.
 *
 * The Mosaic Roast page is the AI-output-critique surface at
 * /persona-mosaic-roast. 4 minds judge an output, score it 0-10,
 * each producing a sharp / mixed / soft verdict.
 *
 * Invariants:
 *  - exactly 4 critiques per roast
 *  - every critique references a real persona id
 *  - every verdict is in the closed set (sharp / mixed / soft)
 *  - average score is the mean of all 4 scores
 *  - dominant verdict is the mode of verdicts
 *  - is deterministic for the same input
 *  - share URL encodes the output
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  SCORE_BAND_LABELS,
  VERDICT_LABELS,
  buildMosaicRoast,
  clearMosaicRoastCounter,
  incrementMosaicRoastCounter,
  mosaicRoastShareUrl,
  mosaicRoastValid,
  readMosaicRoastCounter,
  scoreBand,
  type CritiqueVerdict,
  type ScoreBand,
} from './personaMosaicRoast';

const VALID_VERDICTS = new Set<CritiqueVerdict>(['sharp', 'mixed', 'soft']);

describe('buildMosaicRoast', () => {
  it('returns 4 critiques for any output', () => {
    const r = buildMosaicRoast('A sample AI output.');
    expect(r.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const r = buildMosaicRoast('Sample output.');
    expect(mosaicRoastValid(r)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of r.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every verdict is in the closed set', () => {
    const r = buildMosaicRoast('Sample output.');
    for (const c of r.critiques) {
      expect(VALID_VERDICTS.has(c.verdict)).toBe(true);
    }
  });

  it('every score is in 0..10', () => {
    const r = buildMosaicRoast('Sample output.');
    for (const c of r.critiques) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(10);
    }
  });

  it('averageScore is the mean of the 4 scores (rounded)', () => {
    const r = buildMosaicRoast('Sample output.');
    const total = r.critiques.reduce((s, c) => s + c.score, 0);
    const expected = Math.round((total / r.critiques.length) * 10) / 10;
    expect(r.averageScore).toBe(expected);
  });

  it('dominantVerdict is the mode', () => {
    const r = buildMosaicRoast('Sample output.');
    const counts: Record<CritiqueVerdict, number> = { sharp: 0, mixed: 0, soft: 0 };
    for (const c of r.critiques) counts[c.verdict] += 1;
    const expected = (Object.entries(counts) as Array<[CritiqueVerdict, number]>)
      .sort((a, b) => b[1] - a[1])[0][0];
    expect(r.dominantVerdict).toBe(expected);
  });

  it('is deterministic for the same input', () => {
    const a = buildMosaicRoast('A fixed test output.');
    const b = buildMosaicRoast('A fixed test output.');
    expect(a.critiques.map((c) => `${c.personaId}:${c.verdict}:${c.score}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.verdict}:${c.score}`),
    );
  });

  it('produces different critiques for different outputs', () => {
    const a = buildMosaicRoast('Output A');
    const b = buildMosaicRoast('Output B');
    const aKey = a.critiques.map((c) => `${c.personaId}:${c.verdict}`).join('|');
    const bKey = b.critiques.map((c) => `${c.personaId}:${c.verdict}`).join('|');
    expect(aKey).not.toBe(bKey);
  });

  it('uses the curated critic pool when possible', () => {
    const r = buildMosaicRoast('Sample output.');
    const curated = ['analyst', 'philosopher', 'pragmatist', 'strategist'];
    const ids = r.critiques.map((c) => c.personaId);
    const curatedCount = ids.filter((id) => curated.includes(id)).length;
    expect(curatedCount).toBeGreaterThanOrEqual(3);
  });
});

describe('mosaicRoastShareUrl', () => {
  it('encodes the output into a query string', () => {
    const url = mosaicRoastShareUrl('https://x', 'A sample output.');
    expect(url).toContain('/persona-mosaic-roast');
    expect(url).toContain('o=A%20sample%20output.');
  });
});

describe('VERDICT_LABELS', () => {
  it('returns a non-empty label for every verdict', () => {
    for (const v of VALID_VERDICTS) {
      expect(VERDICT_LABELS[v].length).toBeGreaterThan(0);
    }
  });
});

describe('scoreBand', () => {
  it('returns high for scores >= 7', () => {
    for (const score of [7, 8, 9, 10]) {
      expect(scoreBand(score)).toBe('high');
    }
  });

  it('returns mid for scores 4-6', () => {
    for (const score of [4, 5, 6]) {
      expect(scoreBand(score)).toBe('mid');
    }
  });

  it('returns low for scores 0-3', () => {
    for (const score of [0, 1, 2, 3]) {
      expect(scoreBand(score)).toBe('low');
    }
  });
});

describe('SCORE_BAND_LABELS', () => {
  it('returns a non-empty label for every band', () => {
    const bands: ScoreBand[] = ['low', 'mid', 'high'];
    for (const b of bands) {
      expect(SCORE_BAND_LABELS[b].length).toBeGreaterThan(0);
    }
  });
});

describe('mosaic roast counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearMosaicRoastCounter();
    expect(readMosaicRoastCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearMosaicRoastCounter();
    expect(incrementMosaicRoastCounter()).toBe(1);
    expect(incrementMosaicRoastCounter()).toBe(2);
    expect(incrementMosaicRoastCounter()).toBe(3);
  });

  it('clearMosaicRoastCounter resets to 0', () => {
    incrementMosaicRoastCounter();
    incrementMosaicRoastCounter();
    clearMosaicRoastCounter();
    expect(readMosaicRoastCounter()).toBe(0);
  });
});