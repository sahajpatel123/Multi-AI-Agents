/**
 * Tests for Persona Mosaic Dilemma Council data + 8-mind voting.
 *
 * The Mosaic Dilemma Council page is the 8-mind A vs B dilemma
 * deliberation at /persona-mosaic-dilemma-council. 8 personas
 * each pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 8 critiques per council
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 8
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same option pair
 *  - share URL encodes both options
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendMosaicDilemmaCouncilDecision,
  buildMosaicDilemmaCouncil,
  clearMosaicDilemmaCouncilCounter,
  clearMosaicDilemmaCouncilDecisions,
  incrementMosaicDilemmaCouncilCounter,
  mosaicDilemmaCouncilMajorityInfo,
  mosaicDilemmaCouncilShareUrl,
  mosaicDilemmaCouncilValid,
  mosaicDilemmaCouncilWinTally,
  readMosaicDilemmaCouncilCounter,
  readMosaicDilemmaCouncilDecisions,
  type MosaicDilemmaCouncilPick,
} from './personaMosaicDilemmaCouncil';

const VALID_PICKS = new Set<MosaicDilemmaCouncilPick>(['A', 'B']);

describe('buildMosaicDilemmaCouncil', () => {
  it('returns 8 critiques for any pair', () => {
    const c = buildMosaicDilemmaCouncil('Take the safe job', 'Take the risky startup');
    expect(c.critiques).toHaveLength(8);
  });

  it('every critique references a real persona', () => {
    const c = buildMosaicDilemmaCouncil('A', 'B');
    expect(mosaicDilemmaCouncilValid(c)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const cr of c.critiques) {
      expect(known.has(cr.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const c = buildMosaicDilemmaCouncil('A', 'B');
    for (const cr of c.critiques) {
      expect(VALID_PICKS.has(cr.pick)).toBe(true);
    }
  });

  it('tally sums to 8', () => {
    const c = buildMosaicDilemmaCouncil('A', 'B');
    expect(c.tally.a + c.tally.b).toBe(8);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const c = buildMosaicDilemmaCouncil('A', 'B');
    if (c.tally.a > c.tally.b) {
      expect(c.winner).toBe('A');
    } else if (c.tally.b > c.tally.a) {
      expect(c.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(c.winner);
    }
  });

  it('is deterministic for the same option pair', () => {
    const a = buildMosaicDilemmaCouncil('Option A', 'Option B');
    const b = buildMosaicDilemmaCouncil('Option A', 'Option B');
    expect(a.critiques.map((cr) => `${cr.personaId}:${cr.pick}`)).toEqual(
      b.critiques.map((cr) => `${cr.personaId}:${cr.pick}`),
    );
  });

  it('returns 8 distinct persona ids', () => {
    const c = buildMosaicDilemmaCouncil('A', 'B');
    const ids = c.critiques.map((cr) => cr.personaId);
    expect(new Set(ids).size).toBe(8);
  });

  it('trims whitespace from inputs', () => {
    const c = buildMosaicDilemmaCouncil('  Option A  ', '  Option B  ');
    expect(c.optionA).toBe('Option A');
    expect(c.optionB).toBe('Option B');
  });
});

describe('mosaicDilemmaCouncilShareUrl', () => {
  it('encodes both options into the query string', () => {
    const url = mosaicDilemmaCouncilShareUrl('https://x', 'Option A', 'Option B');
    expect(url).toContain('/persona-mosaic-dilemma-council');
    expect(url).toContain('a=Option%20A');
    expect(url).toContain('b=Option%20B');
  });
});

describe('mosaic dilemma council counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearMosaicDilemmaCouncilCounter();
    expect(readMosaicDilemmaCouncilCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearMosaicDilemmaCouncilCounter();
    expect(incrementMosaicDilemmaCouncilCounter()).toBe(1);
    expect(incrementMosaicDilemmaCouncilCounter()).toBe(2);
  });

  it('clearMosaicDilemmaCouncilCounter resets to 0', () => {
    incrementMosaicDilemmaCouncilCounter();
    clearMosaicDilemmaCouncilCounter();
    expect(readMosaicDilemmaCouncilCounter()).toBe(0);
  });
});

describe('mosaic dilemma council decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: MosaicDilemmaCouncilPick) => ({
    id,
    optionASnippet: 'A',
    optionBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readMosaicDilemmaCouncilDecisions returns empty array when storage is empty', () => {
    clearMosaicDilemmaCouncilDecisions();
    expect(readMosaicDilemmaCouncilDecisions()).toEqual([]);
  });

  it('appendMosaicDilemmaCouncilDecision + read round-trip', () => {
    clearMosaicDilemmaCouncilDecisions();
    appendMosaicDilemmaCouncilDecision(makeDecision('d-1', 'A'));
    expect(readMosaicDilemmaCouncilDecisions()).toHaveLength(1);
  });

  it('appendMosaicDilemmaCouncilDecision deduplicates by id', () => {
    clearMosaicDilemmaCouncilDecisions();
    appendMosaicDilemmaCouncilDecision(makeDecision('dup', 'A'));
    appendMosaicDilemmaCouncilDecision(makeDecision('dup', 'B'));
    const result = readMosaicDilemmaCouncilDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearMosaicDilemmaCouncilDecisions empties storage', () => {
    appendMosaicDilemmaCouncilDecision(makeDecision('x', 'A'));
    clearMosaicDilemmaCouncilDecisions();
    expect(readMosaicDilemmaCouncilDecisions()).toEqual([]);
  });
});

describe('mosaicDilemmaCouncilWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(mosaicDilemmaCouncilWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', optionASnippet: 'A', optionBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', optionASnippet: 'A', optionBSnippet: 'B', winner: 'B' as const, savedAt: '' },
      { id: 'c', optionASnippet: 'A', optionBSnippet: 'B', winner: 'A' as const, savedAt: '' },
    ];
    const tally = mosaicDilemmaCouncilWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(1);
  });
});

describe('mosaicDilemmaCouncilMajorityInfo', () => {
  it('returns decisive for 5+/8', () => {
    const info = mosaicDilemmaCouncilMajorityInfo({ a: 6, b: 2 }, 'A');
    expect(info.label).toBe('decisive');
    expect(info.winnerCount).toBe(6);
  });

  it('returns leaning for 4/8', () => {
    const info = mosaicDilemmaCouncilMajorityInfo({ a: 4, b: 4 }, 'A');
    expect(info.label).toBe('leaning');
  });

  it('returns split for 3/8 or less', () => {
    // The function returns 'split' when the winner has 3 or fewer
    // minds (i.e. the verdict is not strong). A 3-0 tally has a winner
    // with 3, so it is split.
    const info = mosaicDilemmaCouncilMajorityInfo({ a: 3, b: 0 }, 'A');
    expect(info.label).toBe('split');
  });
});
