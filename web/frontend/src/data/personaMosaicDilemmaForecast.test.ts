/**
 * Tests for Persona Mosaic Dilemma Forecast data + 8-mind voting.
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  buildMosaicDilemmaForecast,
  mosaicDilemmaForecastShareUrl,
  mosaicDilemmaForecastValid,
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