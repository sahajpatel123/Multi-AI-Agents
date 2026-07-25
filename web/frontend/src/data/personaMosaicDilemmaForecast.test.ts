/**
 * Tests for Persona Mosaic Dilemma Forecast data + 8-mind voting.
 *
 * The Mosaic Dilemma Forecast page is the 8-mind A vs B
 * dilemma framing comparison at /persona-mosaic-dilemma-forecast.
 * 8 personas each pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 8 critiques per forecast
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 8
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same dilemma pair
 *  - share URL encodes both inputs
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendMosaicDilemmaForecastDecision,
  buildMosaicDilemmaForecast,
  clearMosaicDilemmaForecastCounter,
  clearMosaicDilemmaForecastDecisions,
  incrementMosaicDilemmaForecastCounter,
  mosaicDilemmaForecastMajorityInfo,
  mosaicDilemmaForecastShareUrl,
  mosaicDilemmaForecastValid,
  mosaicDilemmaForecastWinTally,
  readMosaicDilemmaForecastCounter,
  readMosaicDilemmaForecastDecisions,
  type MosaicDilemmaForecastPick,
} from './personaMosaicDilemmaForecast';

const VALID_PICKS = new Set<MosaicDilemmaForecastPick>(['A', 'B']);

describe('buildMosaicDilemmaForecast', () => {
  it('returns 8 critiques for any pair', () => {
    const f = buildMosaicDilemmaForecast('Take the safe job', 'Take the risky startup');
    expect(f.critiques).toHaveLength(8);
  });

  it('every critique references a real persona', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    expect(mosaicDilemmaForecastValid(f)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of f.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    for (const c of f.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 8', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    expect(f.tally.a + f.tally.b).toBe(8);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    if (f.tally.a > f.tally.b) {
      expect(f.winner).toBe('A');
    } else if (f.tally.b > f.tally.a) {
      expect(f.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(f.winner);
    }
  });

  it('is deterministic for the same dilemma pair', () => {
    const a = buildMosaicDilemmaForecast('Dilemma A', 'Dilemma B');
    const b = buildMosaicDilemmaForecast('Dilemma A', 'Dilemma B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('returns 8 distinct persona ids', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    const ids = f.critiques.map((c) => c.personaId);
    expect(new Set(ids).size).toBe(8);
  });

  it('trims whitespace from inputs', () => {
    const f = buildMosaicDilemmaForecast('  A  ', '  B  ');
    expect(f.dilemmaA).toBe('A');
    expect(f.dilemmaB).toBe('B');
  });
});

describe('mosaicDilemmaForecastShareUrl', () => {
  it('encodes both inputs into the query string', () => {
    const url = mosaicDilemmaForecastShareUrl('https://x', 'A', 'B');
    expect(url).toContain('/persona-mosaic-dilemma-forecast');
    expect(url).toContain('a=A');
    expect(url).toContain('b=B');
  });
});
describe('mosaic dilemma forecast counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearMosaicDilemmaForecastCounter();
    expect(readMosaicDilemmaForecastCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearMosaicDilemmaForecastCounter();
    expect(incrementMosaicDilemmaForecastCounter()).toBe(1);
    expect(incrementMosaicDilemmaForecastCounter()).toBe(2);
  });

  it('clearMosaicDilemmaForecastCounter resets to 0', () => {
    incrementMosaicDilemmaForecastCounter();
    clearMosaicDilemmaForecastCounter();
    expect(readMosaicDilemmaForecastCounter()).toBe(0);
  });
});

describe('mosaic dilemma forecast decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: MosaicDilemmaForecastPick) => ({
    id,
    dilemmaASnippet: 'A',
    dilemmaBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readMosaicDilemmaForecastDecisions returns empty array when storage is empty', () => {
    clearMosaicDilemmaForecastDecisions();
    expect(readMosaicDilemmaForecastDecisions()).toEqual([]);
  });

  it('appendMosaicDilemmaForecastDecision + read round-trip', () => {
    clearMosaicDilemmaForecastDecisions();
    appendMosaicDilemmaForecastDecision(makeDecision('d-1', 'A'));
    expect(readMosaicDilemmaForecastDecisions()).toHaveLength(1);
  });

  it('appendMosaicDilemmaForecastDecision deduplicates by id', () => {
    clearMosaicDilemmaForecastDecisions();
    appendMosaicDilemmaForecastDecision(makeDecision('dup', 'A'));
    appendMosaicDilemmaForecastDecision(makeDecision('dup', 'B'));
    const result = readMosaicDilemmaForecastDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('appendMosaicDilemmaForecastDecision caps at 50 entries', () => {
    clearMosaicDilemmaForecastDecisions();
    for (let i = 0; i < 60; i++) {
      appendMosaicDilemmaForecastDecision(makeDecision(`d-${i}`, 'A'));
    }
    expect(readMosaicDilemmaForecastDecisions().length).toBe(50);
  });

  it('clearMosaicDilemmaForecastDecisions empties storage', () => {
    appendMosaicDilemmaForecastDecision(makeDecision('x', 'A'));
    clearMosaicDilemmaForecastDecisions();
    expect(readMosaicDilemmaForecastDecisions()).toEqual([]);
  });
});

describe('mosaicDilemmaForecastWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(mosaicDilemmaForecastWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'c', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'B' as const, savedAt: '' },
    ];
    const tally = mosaicDilemmaForecastWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(1);
  });
});

describe('mosaicDilemmaForecastMajorityInfo', () => {
  it('returns decisive for 5+/8', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 5, b: 3 }, 'A');
    expect(info.label).toBe('decisive');
  });

  it('returns leaning for 4/8', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 4, b: 4 }, 'A');
    expect(info.label).toBe('leaning');
  });

  it('returns split for 3/8 or less', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 3, b: 5 }, 'A');
    expect(info.label).toBe('split');
  });
});
