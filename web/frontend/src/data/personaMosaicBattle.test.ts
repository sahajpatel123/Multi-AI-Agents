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
  buildMosaicBattle,
  mosaicBattleShareUrl,
  mosaicBattleValid,
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