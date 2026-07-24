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
  buildDilemmaForecast,
  dilemmaForecastShareUrl,
  dilemmaForecastValid,
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