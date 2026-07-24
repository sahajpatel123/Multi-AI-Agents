/**
 * Tests for Persona Forecast data + scenario engine.
 *
 * The Forecast page is the scenario-prediction surface at
 * /persona-forecast. 4 personas each predict outcomes from their
 * angle (up / down / sideways / disruption).
 *
 * Invariants:
 *  - exactly 4 takes per forecast
 *  - every take references a real persona id
 *  - stance is in the closed set (4 values)
 *  - takes reference the curated forecaster pool (futurist,
 *    analyst, optimist, strategist) when possible
 *  - same scenario in = same forecast out (deterministic)
 *  - summary counts sum to 4
 *  - share URL encodes the scenario
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  FORECAST_STANCE_LABELS,
  buildForecast,
  forecastShareUrl,
  forecastValid,
} from './personaForecast';

const VALID_STANCES = new Set(Object.keys(FORECAST_STANCE_LABELS));

describe('buildForecast', () => {
  it('returns 4 takes for any scenario', () => {
    const f = buildForecast('AI in 10 years');
    expect(f.takes).toHaveLength(4);
  });

  it('every take references a real persona', () => {
    const f = buildForecast('Sample scenario');
    expect(forecastValid(f)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const t of f.takes) {
      expect(known.has(t.personaId)).toBe(true);
    }
  });

  it('every stance is in the closed set', () => {
    const f = buildForecast('Remote work in 5 years');
    for (const t of f.takes) {
      expect(VALID_STANCES.has(t.stance)).toBe(true);
    }
  });

  it('summary counts sum to 4', () => {
    const f = buildForecast('Crypto by 2030');
    const sum = f.summary.up + f.summary.down + f.summary.sideways + f.summary.disruption;
    expect(sum).toBe(4);
  });

  it('is deterministic for the same scenario', () => {
    const a = buildForecast('A fixed test scenario.');
    const b = buildForecast('A fixed test scenario.');
    expect(a.takes.map((t) => `${t.personaId}:${t.stance}`)).toEqual(
      b.takes.map((t) => `${t.personaId}:${t.stance}`),
    );
  });

  it('produces different forecasts for different scenarios', () => {
    const a = buildForecast('AI in 10 years');
    const b = buildForecast('Climate by 2040');
    const aKey = a.takes.map((t) => `${t.personaId}:${t.stance}`).join('|');
    const bKey = b.takes.map((t) => `${t.personaId}:${t.stance}`).join('|');
    expect(aKey).not.toBe(bKey);
  });

  it('returns 4 distinct persona ids', () => {
    const f = buildForecast('Any scenario');
    const ids = f.takes.map((t) => t.personaId);
    expect(new Set(ids).size).toBe(4);
  });

  it('uses the curated forecaster pool when possible', () => {
    const f = buildForecast('Sample scenario');
    const curated = ['futurist', 'analyst', 'optimist', 'strategist'];
    const ids = f.takes.map((t) => t.personaId);
    // At least 3 of the 4 should be from the curated set.
    const curatedCount = ids.filter((id) => curated.includes(id)).length;
    expect(curatedCount).toBeGreaterThanOrEqual(3);
  });
});

describe('forecastShareUrl', () => {
  it('encodes the scenario into a query string', () => {
    const url = forecastShareUrl('https://x', 'AI in 10 years');
    expect(url).toContain('/persona-forecast');
    expect(url).toContain('s=AI%20in%2010%20years');
  });
});