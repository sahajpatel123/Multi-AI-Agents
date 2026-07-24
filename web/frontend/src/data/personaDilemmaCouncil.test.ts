/**
 * Tests for Persona Dilemma Council data + 8-mind voting.
 *
 * The Dilemma Council page is the 8-mind A-vs-B dilemma
 * deliberation at /persona-dilemma-council. 8 personas each
 * pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 8 critiques per council
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 8
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same pair
 *  - share URL encodes both options
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendDilemmaCouncilDecision,
  buildDilemmaCouncil,
  clearDilemmaCouncilCounter,
  clearDilemmaCouncilDecisions,
  dilemmaCouncilMajorityInfo,
  dilemmaCouncilShareUrl,
  dilemmaCouncilValid,
  dilemmaCouncilWinTally,
  incrementDilemmaCouncilCounter,
  readDilemmaCouncilCounter,
  readDilemmaCouncilDecisions,
  type DilemmaCouncilPick,
} from './personaDilemmaCouncil';

const VALID_PICKS = new Set<DilemmaCouncilPick>(['A', 'B']);

describe('buildDilemmaCouncil', () => {
  it('returns 8 critiques for any pair', () => {
    const c = buildDilemmaCouncil('Take the safe job', 'Take the risky startup');
    expect(c.critiques).toHaveLength(8);
  });

  it('every critique references a real persona', () => {
    const c = buildDilemmaCouncil('Sample A', 'Sample B');
    expect(dilemmaCouncilValid(c)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const cr of c.critiques) {
      expect(known.has(cr.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const c = buildDilemmaCouncil('A', 'B');
    for (const cr of c.critiques) {
      expect(VALID_PICKS.has(cr.pick)).toBe(true);
    }
  });

  it('tally sums to 8', () => {
    const c = buildDilemmaCouncil('A', 'B');
    expect(c.tally.a + c.tally.b).toBe(8);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const c = buildDilemmaCouncil('A', 'B');
    if (c.tally.a > c.tally.b) {
      expect(c.winner).toBe('A');
    } else if (c.tally.b > c.tally.a) {
      expect(c.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(c.winner);
    }
  });

  it('is deterministic for the same pair', () => {
    const a = buildDilemmaCouncil('Option A', 'Option B');
    const b = buildDilemmaCouncil('Option A', 'Option B');
    expect(a.critiques.map((cr) => `${cr.personaId}:${cr.pick}`)).toEqual(
      b.critiques.map((cr) => `${cr.personaId}:${cr.pick}`),
    );
  });

  it('returns 8 distinct persona ids', () => {
    const c = buildDilemmaCouncil('A', 'B');
    const ids = c.critiques.map((cr) => cr.personaId);
    expect(new Set(ids).size).toBe(8);
  });

  it('trims whitespace from inputs', () => {
    const c = buildDilemmaCouncil('  Option A  ', '  Option B  ');
    expect(c.optionA).toBe('Option A');
    expect(c.optionB).toBe('Option B');
  });
});

describe('dilemmaCouncilShareUrl', () => {
  it('encodes both options into the query string', () => {
    const url = dilemmaCouncilShareUrl('https://x', 'A text', 'B text');
    expect(url).toContain('/persona-dilemma-council');
    expect(url).toContain('a=A%20text');
    expect(url).toContain('b=B%20text');
  });
});

describe('dilemma council counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearDilemmaCouncilCounter();
    expect(readDilemmaCouncilCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearDilemmaCouncilCounter();
    expect(incrementDilemmaCouncilCounter()).toBe(1);
    expect(incrementDilemmaCouncilCounter()).toBe(2);
  });

  it('clearDilemmaCouncilCounter resets to 0', () => {
    incrementDilemmaCouncilCounter();
    clearDilemmaCouncilCounter();
    expect(readDilemmaCouncilCounter()).toBe(0);
  });
});

describe('dilemma council decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: DilemmaCouncilPick) => ({
    id,
    optionASnippet: 'A',
    optionBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readDilemmaCouncilDecisions returns empty array when storage is empty', () => {
    clearDilemmaCouncilDecisions();
    expect(readDilemmaCouncilDecisions()).toEqual([]);
  });

  it('appendDilemmaCouncilDecision + read round-trip', () => {
    clearDilemmaCouncilDecisions();
    appendDilemmaCouncilDecision(makeDecision('d-1', 'A'));
    expect(readDilemmaCouncilDecisions()).toHaveLength(1);
  });

  it('appendDilemmaCouncilDecision deduplicates by id', () => {
    clearDilemmaCouncilDecisions();
    appendDilemmaCouncilDecision(makeDecision('dup', 'A'));
    appendDilemmaCouncilDecision(makeDecision('dup', 'B'));
    const result = readDilemmaCouncilDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearDilemmaCouncilDecisions empties storage', () => {
    appendDilemmaCouncilDecision(makeDecision('x', 'A'));
    clearDilemmaCouncilDecisions();
    expect(readDilemmaCouncilDecisions()).toEqual([]);
  });
});

describe('dilemmaCouncilWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(dilemmaCouncilWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', optionASnippet: 'A', optionBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', optionASnippet: 'A', optionBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'c', optionASnippet: 'A', optionBSnippet: 'B', winner: 'B' as const, savedAt: '' },
      { id: 'd', optionASnippet: 'A', optionBSnippet: 'B', winner: 'B' as const, savedAt: '' },
      { id: 'e', optionASnippet: 'A', optionBSnippet: 'B', winner: 'B' as const, savedAt: '' },
    ];
    const tally = dilemmaCouncilWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(3);
  });
});

describe('dilemmaCouncilMajorityInfo', () => {
  it('returns decisive for 5+/8', () => {
    const info = dilemmaCouncilMajorityInfo({ a: 6, b: 2 }, 'A');
    expect(info.label).toBe('decisive');
    expect(info.winnerCount).toBe(6);
  });

  it('returns leaning for 4/8', () => {
    const info = dilemmaCouncilMajorityInfo({ a: 4, b: 4 }, 'A');
    expect(info.label).toBe('leaning');
  });

  it('returns split for 3/8 or less', () => {
    const info = dilemmaCouncilMajorityInfo({ a: 5, b: 3 }, 'B');
    expect(info.label).toBe('split');
    expect(info.winnerCount).toBe(3);
  });
});