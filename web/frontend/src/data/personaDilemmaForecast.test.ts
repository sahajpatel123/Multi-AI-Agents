/**
 * Tests for Persona Dilemma Forecast data + 4-mind voting.
 *
 * The Dilemma Forecast page is the 4-mind "which dilemma is
 * sharper?" comparison at /persona-dilemma-forecast. 4
 * personas each pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 4 critiques per forecast
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 4
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same dilemma pair
 *  - share URL encodes both dilemmas
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendDilemmaForecastDecision,
  buildDilemmaForecast,
  clearDilemmaForecastCounter,
  clearDilemmaForecastDecisions,
  dilemmaForecastMajorityInfo,
  dilemmaForecastShareUrl,
  dilemmaForecastValid,
  dilemmaForecastWinTally,
  incrementDilemmaForecastCounter,
  readDilemmaForecastCounter,
  readDilemmaForecastDecisions,
  type DilemmaForecastPick,
} from './personaDilemmaForecast';

const VALID_PICKS = new Set<DilemmaForecastPick>(['A', 'B']);

describe('buildDilemmaForecast', () => {
  it('returns 4 critiques for any pair', () => {
    const f = buildDilemmaForecast('Take the safe job', 'Take the risky startup');
    expect(f.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const f = buildDilemmaForecast('A', 'B');
    expect(dilemmaForecastValid(f)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of f.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const f = buildDilemmaForecast('A', 'B');
    for (const c of f.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 4', () => {
    const f = buildDilemmaForecast('A', 'B');
    expect(f.tally.a + f.tally.b).toBe(4);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const f = buildDilemmaForecast('A', 'B');
    if (f.tally.a > f.tally.b) {
      expect(f.winner).toBe('A');
    } else if (f.tally.b > f.tally.a) {
      expect(f.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(f.winner);
    }
  });

  it('is deterministic for the same dilemma pair', () => {
    const a = buildDilemmaForecast('Dilemma A', 'Dilemma B');
    const b = buildDilemmaForecast('Dilemma A', 'Dilemma B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('returns 4 distinct persona ids', () => {
    const f = buildDilemmaForecast('A', 'B');
    const ids = f.critiques.map((c) => c.personaId);
    expect(new Set(ids).size).toBe(4);
  });

  it('trims whitespace from inputs', () => {
    const f = buildDilemmaForecast('  Dilemma A  ', '  Dilemma B  ');
    expect(f.dilemmaA).toBe('Dilemma A');
    expect(f.dilemmaB).toBe('Dilemma B');
  });
});

describe('dilemmaForecastShareUrl', () => {
  it('encodes both dilemmas into the query string', () => {
    const url = dilemmaForecastShareUrl('https://x', 'Dilemma A', 'Dilemma B');
    expect(url).toContain('/persona-dilemma-forecast');
    expect(url).toContain('a=Dilemma%20A');
    expect(url).toContain('b=Dilemma%20B');
  });
});

describe('dilemma forecast counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearDilemmaForecastCounter();
    expect(readDilemmaForecastCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearDilemmaForecastCounter();
    expect(incrementDilemmaForecastCounter()).toBe(1);
    expect(incrementDilemmaForecastCounter()).toBe(2);
  });

  it('clearDilemmaForecastCounter resets to 0', () => {
    incrementDilemmaForecastCounter();
    clearDilemmaForecastCounter();
    expect(readDilemmaForecastCounter()).toBe(0);
  });
});

describe('dilemma forecast decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: DilemmaForecastPick) => ({
    id,
    dilemmaASnippet: 'A',
    dilemmaBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readDilemmaForecastDecisions returns empty array when storage is empty', () => {
    clearDilemmaForecastDecisions();
    expect(readDilemmaForecastDecisions()).toEqual([]);
  });

  it('appendDilemmaForecastDecision + read round-trip', () => {
    clearDilemmaForecastDecisions();
    appendDilemmaForecastDecision(makeDecision('d-1', 'A'));
    expect(readDilemmaForecastDecisions()).toHaveLength(1);
  });

  it('appendDilemmaForecastDecision deduplicates by id', () => {
    clearDilemmaForecastDecisions();
    appendDilemmaForecastDecision(makeDecision('dup', 'A'));
    appendDilemmaForecastDecision(makeDecision('dup', 'B'));
    const result = readDilemmaForecastDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearDilemmaForecastDecisions empties storage', () => {
    appendDilemmaForecastDecision(makeDecision('x', 'A'));
    clearDilemmaForecastDecisions();
    expect(readDilemmaForecastDecisions()).toEqual([]);
  });
});

describe('dilemmaForecastWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(dilemmaForecastWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'c', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'B' as const, savedAt: '' },
    ];
    const tally = dilemmaForecastWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(1);
  });
});

describe('dilemmaForecastMajorityInfo', () => {
  it('returns unanimous for 4/4', () => {
    const info = dilemmaForecastMajorityInfo({ a: 4, b: 0 }, 'A');
    expect(info.label).toBe('unanimous');
    expect(info.winnerCount).toBe(4);
  });

  it('returns strong for 3/4', () => {
    const info = dilemmaForecastMajorityInfo({ a: 3, b: 1 }, 'A');
    expect(info.label).toBe('strong');
  });

  it('returns split for 2/4 or less', () => {
    const info = dilemmaForecastMajorityInfo({ a: 2, b: 2 }, 'A');
    expect(info.label).toBe('split');
  });
});