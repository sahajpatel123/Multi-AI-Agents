/**
 * Tests for Persona Mosaic Forecast data + 4-mind voting.
 *
 * The Mosaic Forecast page is the 4-mind A vs B future-scenario
 * pick at /persona-mosaic-forecast. 4 personas each pick A or
 * B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 4 critiques per forecast
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 4
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same input pair
 *  - share URL encodes both inputs
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendMosaicForecastDecision,
  buildMosaicForecast,
  clearMosaicForecastCounter,
  clearMosaicForecastDecisions,
  incrementMosaicForecastCounter,
  mosaicForecastMajorityInfo,
  mosaicForecastShareUrl,
  mosaicForecastValid,
  mosaicForecastWinTally,
  readMosaicForecastCounter,
  readMosaicForecastDecisions,
  type MosaicForecastPick,
} from './personaMosaicForecast';

const VALID_PICKS = new Set<MosaicForecastPick>(['A', 'B']);

describe('buildMosaicForecast', () => {
  it('returns 4 critiques for any pair', () => {
    const f = buildMosaicForecast('AI in 5 years — A', 'AI in 5 years — B');
    expect(f.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const f = buildMosaicForecast('A', 'B');
    expect(mosaicForecastValid(f)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of f.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const f = buildMosaicForecast('A', 'B');
    for (const c of f.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 4', () => {
    const f = buildMosaicForecast('A', 'B');
    expect(f.tally.a + f.tally.b).toBe(4);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const f = buildMosaicForecast('A', 'B');
    if (f.tally.a > f.tally.b) {
      expect(f.winner).toBe('A');
    } else if (f.tally.b > f.tally.a) {
      expect(f.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(f.winner);
    }
  });

  it('is deterministic for the same input pair', () => {
    const a = buildMosaicForecast('Forecast A', 'Forecast B');
    const b = buildMosaicForecast('Forecast A', 'Forecast B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('returns 4 distinct persona ids', () => {
    const f = buildMosaicForecast('A', 'B');
    const ids = f.critiques.map((c) => c.personaId);
    expect(new Set(ids).size).toBe(4);
  });

  it('trims whitespace from inputs', () => {
    const f = buildMosaicForecast('  Forecast A  ', '  Forecast B  ');
    expect(f.outputA).toBe('Forecast A');
    expect(f.outputB).toBe('Forecast B');
  });
});

describe('mosaicForecastShareUrl', () => {
  it('encodes both inputs into the query string', () => {
    const url = mosaicForecastShareUrl('https://x', 'Forecast A', 'Forecast B');
    expect(url).toContain('/persona-mosaic-forecast');
    expect(url).toContain('a=Forecast%20A');
    expect(url).toContain('b=Forecast%20B');
  });
});
describe('mosaic forecast counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearMosaicForecastCounter();
    expect(readMosaicForecastCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearMosaicForecastCounter();
    expect(incrementMosaicForecastCounter()).toBe(1);
    expect(incrementMosaicForecastCounter()).toBe(2);
  });

  it('clearMosaicForecastCounter resets to 0', () => {
    incrementMosaicForecastCounter();
    clearMosaicForecastCounter();
    expect(readMosaicForecastCounter()).toBe(0);
  });
});

describe('mosaic forecast decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: MosaicForecastPick) => ({
    id,
    outputASnippet: 'A',
    outputBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readMosaicForecastDecisions returns empty array when storage is empty', () => {
    clearMosaicForecastDecisions();
    expect(readMosaicForecastDecisions()).toEqual([]);
  });

  it('appendMosaicForecastDecision + read round-trip', () => {
    clearMosaicForecastDecisions();
    appendMosaicForecastDecision(makeDecision('d-1', 'A'));
    expect(readMosaicForecastDecisions()).toHaveLength(1);
  });

  it('appendMosaicForecastDecision deduplicates by id', () => {
    clearMosaicForecastDecisions();
    appendMosaicForecastDecision(makeDecision('dup', 'A'));
    appendMosaicForecastDecision(makeDecision('dup', 'B'));
    const result = readMosaicForecastDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearMosaicForecastDecisions empties storage', () => {
    appendMosaicForecastDecision(makeDecision('x', 'A'));
    clearMosaicForecastDecisions();
    expect(readMosaicForecastDecisions()).toEqual([]);
  });
});

describe('mosaicForecastWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(mosaicForecastWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'c', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B' as const, savedAt: '' },
    ];
    const tally = mosaicForecastWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(1);
  });
});

describe('mosaicForecastMajorityInfo', () => {
  it('returns unanimous for 4/4', () => {
    const info = mosaicForecastMajorityInfo({ a: 4, b: 0 }, 'A');
    expect(info.label).toBe('unanimous');
  });

  it('returns strong for 3/4', () => {
    const info = mosaicForecastMajorityInfo({ a: 3, b: 1 }, 'A');
    expect(info.label).toBe('strong');
  });

  it('returns split for 2/4 or less', () => {
    const info = mosaicForecastMajorityInfo({ a: 2, b: 2 }, 'A');
    expect(info.label).toBe('split');
  });
});
