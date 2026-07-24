/**
 * Tests for Persona Mosaic Battle data + 4-mind voting.
 *
 * The Mosaic Battle page is the A-vs-B output comparison at
 * /persona-mosaic-battle. 4 personas each pick A or B +
 * explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 4 critiques per battle
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 4
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same pair
 *  - share URL encodes both outputs
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendMosaicBattleDecision,
  buildMosaicBattle,
  clearMosaicBattleCounter,
  clearMosaicBattleDecisions,
  incrementMosaicBattleCounter,
  mosaicBattleMajorityInfo,
  mosaicBattleShareUrl,
  mosaicBattleValid,
  mosaicBattleWinTally,
  readMosaicBattleCounter,
  readMosaicBattleDecisions,
  type MosaicBattlePick,
} from './personaMosaicBattle';

const VALID_PICKS = new Set<MosaicBattlePick>(['A', 'B']);

describe('buildMosaicBattle', () => {
  it('returns 4 critiques for any pair', () => {
    const b = buildMosaicBattle('Output A text', 'Output B text');
    expect(b.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const b = buildMosaicBattle('Sample A', 'Sample B');
    expect(mosaicBattleValid(b)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of b.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const b = buildMosaicBattle('A', 'B');
    for (const c of b.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 4', () => {
    const b = buildMosaicBattle('A', 'B');
    expect(b.tally.a + b.tally.b).toBe(4);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const b = buildMosaicBattle('A', 'B');
    if (b.tally.a > b.tally.b) {
      expect(b.winner).toBe('A');
    } else if (b.tally.b > b.tally.a) {
      expect(b.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(b.winner);
    }
  });

  it('is deterministic for the same pair', () => {
    const a = buildMosaicBattle('Output A', 'Output B');
    const b = buildMosaicBattle('Output A', 'Output B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('returns 4 distinct persona ids', () => {
    const b = buildMosaicBattle('A', 'B');
    const ids = b.critiques.map((c) => c.personaId);
    expect(new Set(ids).size).toBe(4);
  });

  it('trims whitespace from inputs', () => {
    const b = buildMosaicBattle('  Output A  ', '  Output B  ');
    expect(b.outputA).toBe('Output A');
    expect(b.outputB).toBe('Output B');
  });
});

describe('mosaicBattleShareUrl', () => {
  it('encodes both outputs into the query string', () => {
    const url = mosaicBattleShareUrl('https://x', 'A text', 'B text');
    expect(url).toContain('/persona-mosaic-battle');
    expect(url).toContain('a=A%20text');
    expect(url).toContain('b=B%20text');
  });
});

describe('mosaic battle counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearMosaicBattleCounter();
    expect(readMosaicBattleCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearMosaicBattleCounter();
    expect(incrementMosaicBattleCounter()).toBe(1);
    expect(incrementMosaicBattleCounter()).toBe(2);
  });

  it('clearMosaicBattleCounter resets to 0', () => {
    incrementMosaicBattleCounter();
    clearMosaicBattleCounter();
    expect(readMosaicBattleCounter()).toBe(0);
  });
});

describe('mosaic battle decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: MosaicBattlePick) => ({
    id,
    outputASnippet: 'A',
    outputBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readMosaicBattleDecisions returns empty array when storage is empty', () => {
    clearMosaicBattleDecisions();
    expect(readMosaicBattleDecisions()).toEqual([]);
  });

  it('appendMosaicBattleDecision + read round-trip', () => {
    clearMosaicBattleDecisions();
    appendMosaicBattleDecision(makeDecision('d-1', 'A'));
    expect(readMosaicBattleDecisions()).toHaveLength(1);
  });

  it('appendMosaicBattleDecision deduplicates by id', () => {
    clearMosaicBattleDecisions();
    appendMosaicBattleDecision(makeDecision('dup', 'A'));
    appendMosaicBattleDecision(makeDecision('dup', 'B'));
    const result = readMosaicBattleDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('clearMosaicBattleDecisions empties storage', () => {
    appendMosaicBattleDecision(makeDecision('x', 'A'));
    clearMosaicBattleDecisions();
    expect(readMosaicBattleDecisions()).toEqual([]);
  });
});

describe('mosaicBattleWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(mosaicBattleWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', outputASnippet: 'A', outputBSnippet: 'B', winner: 'B' as const, savedAt: '' },
      { id: 'c', outputASnippet: 'A', outputBSnippet: 'B', winner: 'A' as const, savedAt: '' },
    ];
    const tally = mosaicBattleWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(1);
  });
});

describe('mosaicBattleMajorityInfo', () => {
  it('returns unanimous for 4/4', () => {
    const info = mosaicBattleMajorityInfo({ a: 4, b: 0 }, 'A');
    expect(info.label).toBe('unanimous');
    expect(info.winnerCount).toBe(4);
  });

  it('returns strong for 3/4', () => {
    const info = mosaicBattleMajorityInfo({ a: 3, b: 1 }, 'A');
    expect(info.label).toBe('strong');
  });

  it('returns split for 2/4 or less', () => {
    const info = mosaicBattleMajorityInfo({ a: 2, b: 2 }, 'A');
    expect(info.label).toBe('split');
  });
});