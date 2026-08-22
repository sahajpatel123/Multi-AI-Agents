/**
 * Tests for Persona Roast Battle data + voting engine.
 *
 * The Roast Battle page is the A-vs-B output comparison at
 * /persona-roast-battle. 4 personas each pick A or B + explain.
 * Pure functions only — same input pair always produces the
 * same panel + picks.
 *
 * Invariants:
 *  - exactly 4 critiques per battle
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally is a count of A/B picks (sums to 4)
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same pair
 *  - share URL encodes both outputs
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendRoastBattleDecision,
  buildRoastBattle,
  clearRoastBattleCounter,
  clearRoastBattleDecisions,
  incrementRoastBattleCounter,
  readRoastBattleCounter,
  readRoastBattleDecisions,
  roastBattleShareUrl,
  roastBattleValid,
  winTally,
  type RoastBattleDecisionEntry,
  type RoastBattlePick,
} from './personaRoastBattle';

const VALID_PICKS = new Set<RoastBattlePick>(['A', 'B']);

describe('buildRoastBattle', () => {
  it('returns 4 critiques for any pair', () => {
    const b = buildRoastBattle('Output A text', 'Output B text');
    expect(b.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const b = buildRoastBattle('A', 'B');
    expect(roastBattleValid(b)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of b.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const b = buildRoastBattle('A', 'B');
    for (const c of b.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 4', () => {
    const b = buildRoastBattle('A', 'B');
    expect(b.tally.a + b.tally.b).toBe(4);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const b = buildRoastBattle('A', 'B');
    if (b.tally.a > b.tally.b) {
      expect(b.winner).toBe('A');
    } else if (b.tally.b > b.tally.a) {
      expect(b.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(b.winner);
    }
  });

  it('is deterministic for the same pair', () => {
    const a = buildRoastBattle('Output A', 'Output B');
    const b = buildRoastBattle('Output A', 'Output B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('picks A or B deterministically from the persona + slot', () => {
    // Each persona's pick is one of A or B — the test verifies the
    // closed-set contract, not the specific value (which depends
    // on the hash).
    const b = buildRoastBattle('Sample A', 'Sample B');
    for (const c of b.critiques) {
      expect(['A', 'B']).toContain(c.pick);
    }
  });

  it('uses the curated critic pool when possible', () => {
    const b = buildRoastBattle('A', 'B');
    const curated = ['analyst', 'philosopher', 'pragmatist', 'strategist'];
    const ids = b.critiques.map((c) => c.personaId);
    const curatedCount = ids.filter((id) => curated.includes(id)).length;
    expect(curatedCount).toBeGreaterThanOrEqual(3);
  });

  it('trims whitespace from inputs', () => {
    const b = buildRoastBattle('  Output A  ', '  Output B  ');
    expect(b.outputA).toBe('Output A');
    expect(b.outputB).toBe('Output B');
  });
});

describe('roastBattleShareUrl', () => {
  it('encodes both outputs into the query string', () => {
    const url = roastBattleShareUrl('https://x', 'A text', 'B text');
    expect(url).toContain('/persona-roast-battle');
    expect(url).toContain('a=A%20text');
    expect(url).toContain('b=B%20text');
  });
});

describe('battle counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearRoastBattleCounter();
    expect(readRoastBattleCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearRoastBattleCounter();
    expect(incrementRoastBattleCounter()).toBe(1);
    expect(incrementRoastBattleCounter()).toBe(2);
    expect(incrementRoastBattleCounter()).toBe(3);
  });

  it('clearRoastBattleCounter resets to 0', () => {
    incrementRoastBattleCounter();
    incrementRoastBattleCounter();
    clearRoastBattleCounter();
    expect(readRoastBattleCounter()).toBe(0);
  });
});

describe('battle decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: RoastBattlePick): RoastBattleDecisionEntry => ({
    id,
    outputASnippet: 'A',
    outputBSnippet: 'B',
    winner,
    savedAt: new Date().toISOString(),
  });

  it('readRoastBattleDecisions returns empty array when storage is empty', () => {
    clearRoastBattleDecisions();
    expect(readRoastBattleDecisions()).toEqual([]);
  });

  it('appendRoastBattleDecision + read round-trip', () => {
    clearRoastBattleDecisions();
    appendRoastBattleDecision(makeDecision('d-1', 'A'));
    expect(readRoastBattleDecisions()).toHaveLength(1);
  });

  it('appendRoastBattleDecision deduplicates by id', () => {
    clearRoastBattleDecisions();
    appendRoastBattleDecision(makeDecision('dup', 'A'));
    appendRoastBattleDecision(makeDecision('dup', 'B'));
    const result = readRoastBattleDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearRoastBattleDecisions empties storage', () => {
    appendRoastBattleDecision(makeDecision('x', 'A'));
    clearRoastBattleDecisions();
    expect(readRoastBattleDecisions()).toEqual([]);
  });
});

describe('winTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(winTally([])).toEqual({ a: 0, b: 0, total: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions: ReadonlyArray<RoastBattleDecisionEntry> = [
      { id: 'a', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A', savedAt: '' },
      { id: 'b', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A', savedAt: '' },
      { id: 'c', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B', savedAt: '' },
      { id: 'd', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B', savedAt: '' },
      { id: 'e', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B', savedAt: '' },
    ];
    expect(winTally(decisions)).toEqual({ a: 2, b: 3, total: 5 });
  });
});
