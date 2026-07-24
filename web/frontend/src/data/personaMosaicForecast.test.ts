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
  buildMosaicForecast,
  mosaicForecastShareUrl,
  mosaicForecastValid,
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