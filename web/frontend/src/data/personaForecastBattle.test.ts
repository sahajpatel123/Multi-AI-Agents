/**
 * Tests for Persona Forecast Battle data + voting engine.
 *
 * The Forecast Battle page is the A-vs-B future-scenario comparison
 * at /persona-forecast-battle. 4 personas each pick A or B +
 * explain. Pure functions only — same input pair produces the
 * same panel + picks.
 *
 * Invariants:
 *  - exactly 4 critiques per battle
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally is a count of A/B picks (sums to 4)
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same pair
 *  - share URL encodes both scenarios
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendForecastBattleDecision,
  buildForecastBattle,
  clearForecastBattleCounter,
  clearForecastBattleDecisions,
  forecastBattleShareUrl,
  forecastBattleValid,
  forecastBattleWinTally,
  incrementForecastBattleCounter,
  readForecastBattleCounter,
  readForecastBattleDecisions,
  type ForecastBattleDecisionEntry,
  type ForecastBattlePick,
} from './personaForecastBattle';

const VALID_PICKS = new Set<ForecastBattlePick>(['A', 'B']);

describe('buildForecastBattle', () => {
  it('returns 4 critiques for any pair', () => {
    const b = buildForecastBattle('Scenario A text', 'Scenario B text');
    expect(b.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const b = buildForecastBattle('Sample A', 'Sample B');
    expect(forecastBattleValid(b)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of b.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const b = buildForecastBattle('A', 'B');
    for (const c of b.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 4', () => {
    const b = buildForecastBattle('A', 'B');
    expect(b.tally.a + b.tally.b).toBe(4);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const b = buildForecastBattle('A', 'B');
    if (b.tally.a > b.tally.b) {
      expect(b.winner).toBe('A');
    } else if (b.tally.b > b.tally.a) {
      expect(b.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(b.winner);
    }
  });

  it('is deterministic for the same pair', () => {
    const a = buildForecastBattle('Scenario A', 'Scenario B');
    const b = buildForecastBattle('Scenario A', 'Scenario B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('uses the curated critic pool when possible', () => {
    const b = buildForecastBattle('A', 'B');
    const curated = ['futurist', 'analyst', 'strategist', 'pragmatist'];
    const ids = b.critiques.map((c) => c.personaId);
    const curatedCount = ids.filter((id) => curated.includes(id)).length;
    expect(curatedCount).toBeGreaterThanOrEqual(3);
  });

  it('trims whitespace from inputs', () => {
    const b = buildForecastBattle('  Scenario A  ', '  Scenario B  ');
    expect(b.scenarioA).toBe('Scenario A');
    expect(b.scenarioB).toBe('Scenario B');
  });
});

describe('forecastBattleShareUrl', () => {
  it('encodes both scenarios into the query string', () => {
    const url = forecastBattleShareUrl('https://x', 'A text', 'B text');
    expect(url).toContain('/persona-forecast-battle');
    expect(url).toContain('a=A%20text');
    expect(url).toContain('b=B%20text');
  });
});

describe('forecast battle counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearForecastBattleCounter();
    expect(readForecastBattleCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearForecastBattleCounter();
    expect(incrementForecastBattleCounter()).toBe(1);
    expect(incrementForecastBattleCounter()).toBe(2);
  });

  it('clearForecastBattleCounter resets to 0', () => {
    incrementForecastBattleCounter();
    incrementForecastBattleCounter();
    clearForecastBattleCounter();
    expect(readForecastBattleCounter()).toBe(0);
  });
});

describe('forecast battle decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: ForecastBattlePick): ForecastBattleDecisionEntry => ({
    id,
    scenarioASnippet: 'A',
    scenarioBSnippet: 'B',
    winner,
    savedAt: new Date().toISOString(),
  });

  it('readForecastBattleDecisions returns empty array when storage is empty', () => {
    clearForecastBattleDecisions();
    expect(readForecastBattleDecisions()).toEqual([]);
  });

  it('appendForecastBattleDecision + read round-trip', () => {
    clearForecastBattleDecisions();
    appendForecastBattleDecision(makeDecision('d-1', 'A'));
    expect(readForecastBattleDecisions()).toHaveLength(1);
  });

  it('appendForecastBattleDecision deduplicates by id', () => {
    clearForecastBattleDecisions();
    appendForecastBattleDecision(makeDecision('dup', 'A'));
    appendForecastBattleDecision(makeDecision('dup', 'B'));
    const result = readForecastBattleDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearForecastBattleDecisions empties storage', () => {
    appendForecastBattleDecision(makeDecision('x', 'A'));
    clearForecastBattleDecisions();
    expect(readForecastBattleDecisions()).toEqual([]);
  });
});

describe('forecastBattleWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(forecastBattleWinTally([])).toEqual({ a: 0, b: 0, total: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions: ReadonlyArray<ForecastBattleDecisionEntry> = [
      { id: 'a', scenarioASnippet: 'A', scenarioBSnippet: 'B', winner: 'A', savedAt: '' },
      { id: 'b', scenarioASnippet: 'A', scenarioBSnippet: 'B', winner: 'A', savedAt: '' },
      { id: 'c', scenarioASnippet: 'A', scenarioBSnippet: 'B', winner: 'B', savedAt: '' },
      { id: 'd', scenarioASnippet: 'A', scenarioBSnippet: 'B', winner: 'B', savedAt: '' },
      { id: 'e', scenarioASnippet: 'A', scenarioBSnippet: 'B', winner: 'B', savedAt: '' },
    ];
    expect(forecastBattleWinTally(decisions)).toEqual({ a: 2, b: 3, total: 5 });
  });
});