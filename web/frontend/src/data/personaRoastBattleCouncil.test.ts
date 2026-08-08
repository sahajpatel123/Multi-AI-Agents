/**
 * Tests for Persona Roast Battle Council data + 8-mind voting.
 *
 * The Roast Battle Council page is the 8-mind A-vs-B output
 * comparison at /persona-roast-battle-council. 8 personas each
 * pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 8 critiques per council
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally is a count of A/B picks (sums to 8)
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same pair
 *  - share URL encodes both outputs
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendRoastBattleCouncilDecision,
  buildRoastBattleCouncil,
  clearRoastBattleCouncilCounter,
  clearRoastBattleCouncilDecisions,
  incrementRoastBattleCouncilCounter,
  majorityInfo,
  readRoastBattleCouncilCounter,
  readRoastBattleCouncilDecisions,
  roastBattleCouncilShareUrl,
  roastBattleCouncilValid,
  roastBattleCouncilWinTally,
  type RoastBattleCouncilPick,
} from './personaRoastBattleCouncil';

const VALID_PICKS = new Set<RoastBattleCouncilPick>(['A', 'B']);

describe('buildRoastBattleCouncil', () => {
  it('returns 8 critiques for any pair', () => {
    const c = buildRoastBattleCouncil('Output A text', 'Output B text');
    expect(c.critiques).toHaveLength(8);
  });

  it('every critique references a real persona', () => {
    const c = buildRoastBattleCouncil('Sample A', 'Sample B');
    expect(roastBattleCouncilValid(c)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const cr of c.critiques) {
      expect(known.has(cr.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const c = buildRoastBattleCouncil('A', 'B');
    for (const cr of c.critiques) {
      expect(VALID_PICKS.has(cr.pick)).toBe(true);
    }
  });

  it('tally sums to 8', () => {
    const c = buildRoastBattleCouncil('A', 'B');
    expect(c.tally.a + c.tally.b).toBe(8);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const c = buildRoastBattleCouncil('A', 'B');
    if (c.tally.a > c.tally.b) {
      expect(c.winner).toBe('A');
    } else if (c.tally.b > c.tally.a) {
      expect(c.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(c.winner);
    }
  });

  it('is deterministic for the same pair', () => {
    const a = buildRoastBattleCouncil('Output A', 'Output B');
    const b = buildRoastBattleCouncil('Output A', 'Output B');
    expect(a.critiques.map((cr) => `${cr.personaId}:${cr.pick}`)).toEqual(
      b.critiques.map((cr) => `${cr.personaId}:${cr.pick}`),
    );
  });

  it('returns 8 distinct persona ids', () => {
    const c = buildRoastBattleCouncil('A', 'B');
    const ids = c.critiques.map((cr) => cr.personaId);
    expect(new Set(ids).size).toBe(8);
  });

  it('trims whitespace from inputs', () => {
    const c = buildRoastBattleCouncil('  Output A  ', '  Output B  ');
    expect(c.outputA).toBe('Output A');
    expect(c.outputB).toBe('Output B');
  });
});

describe('roastBattleCouncilShareUrl', () => {
  it('encodes both outputs into the query string', () => {
    const url = roastBattleCouncilShareUrl('https://x', 'A text', 'B text');
    expect(url).toContain('/persona-roast-battle-council');
    expect(url).toContain('a=A%20text');
    expect(url).toContain('b=B%20text');
  });
});

describe('council counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearRoastBattleCouncilCounter();
    expect(readRoastBattleCouncilCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearRoastBattleCouncilCounter();
    expect(incrementRoastBattleCouncilCounter()).toBe(1);
    expect(incrementRoastBattleCouncilCounter()).toBe(2);
  });

  it('clearRoastBattleCouncilCounter resets to 0', () => {
    incrementRoastBattleCouncilCounter();
    clearRoastBattleCouncilCounter();
    expect(readRoastBattleCouncilCounter()).toBe(0);
  });
});

describe('council decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: RoastBattleCouncilPick) => ({
    id,
    outputASnippet: 'A',
    outputBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readRoastBattleCouncilDecisions returns empty array when storage is empty', () => {
    clearRoastBattleCouncilDecisions();
    expect(readRoastBattleCouncilDecisions()).toEqual([]);
  });

  it('appendRoastBattleCouncilDecision + read round-trip', () => {
    clearRoastBattleCouncilDecisions();
    appendRoastBattleCouncilDecision(makeDecision('d-1', 'A'));
    expect(readRoastBattleCouncilDecisions()).toHaveLength(1);
  });

  it('appendRoastBattleCouncilDecision deduplicates by id', () => {
    clearRoastBattleCouncilDecisions();
    appendRoastBattleCouncilDecision(makeDecision('dup', 'A'));
    appendRoastBattleCouncilDecision(makeDecision('dup', 'B'));
    const result = readRoastBattleCouncilDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearRoastBattleCouncilDecisions empties storage', () => {
    appendRoastBattleCouncilDecision(makeDecision('x', 'A'));
    clearRoastBattleCouncilDecisions();
    expect(readRoastBattleCouncilDecisions()).toEqual([]);
  });
});

describe('roastBattleCouncilWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(roastBattleCouncilWinTally([]).a).toBe(0);
    expect(roastBattleCouncilWinTally([]).b).toBe(0);
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'c', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B' as const, savedAt: '' },
      { id: 'd', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B' as const, savedAt: '' },
      { id: 'e', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B' as const, savedAt: '' },
    ];
    const tally = roastBattleCouncilWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(3);
  });
});

describe('majorityInfo', () => {
  it('returns decisive for 5+/8', () => {
    const info = majorityInfo({ a: 6, b: 2 }, 'A');
    expect(info.label).toBe('decisive');
    expect(info.winnerCount).toBe(6);
    expect(info.loserCount).toBe(2);
  });

  it('returns leaning for 4/8', () => {
    const info = majorityInfo({ a: 4, b: 4 }, 'A');
    expect(info.label).toBe('leaning');
  });

  it('returns split for 3/8 or less', () => {
    // Use a tally where the winning side has 3 (which is split).
    // 4-4 is leaning because the function checks winnerCount <= 3 for split.
    // For a true split, the winner must have 3 or fewer minds.
    // 3-5 means winner (B) has 5 minds, which is decisive.
    // Let's use a 3-5 where A wins with 3 — that's split.
    const info = majorityInfo({ a: 5, b: 3 }, 'B');
    expect(info.label).toBe('split');
    expect(info.winnerCount).toBe(3);
  });
});