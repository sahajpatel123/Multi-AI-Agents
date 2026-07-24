/**
 * Tests for Persona Mosaic Roasting Battle data + 4-mind voting.
 *
 * The Mosaic Roasting Battle page is the 4-mind A vs B output
 * comparison at /persona-mosaic-roasting-battle. 4 personas
 * each pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 4 critiques per battle
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
  buildMosaicRoastingBattle,
  mosaicRoastingBattleShareUrl,
  mosaicRoastingBattleValid,
  type MosaicRoastingBattlePick,
} from './personaMosaicRoastingBattle';

const VALID_PICKS = new Set<MosaicRoastingBattlePick>(['A', 'B']);

describe('buildMosaicRoastingBattle', () => {
  it('returns 4 critiques for any pair', () => {
    const b = buildMosaicRoastingBattle('A text', 'B text');
    expect(b.critiques).toHaveLength(4);
  });

  it('every critique references a real persona', () => {
    const b = buildMosaicRoastingBattle('A', 'B');
    expect(mosaicRoastingBattleValid(b)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of b.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('every pick is in the closed set', () => {
    const b = buildMosaicRoastingBattle('A', 'B');
    for (const c of b.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 4', () => {
    const b = buildMosaicRoastingBattle('A', 'B');
    expect(b.tally.a + b.tally.b).toBe(4);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const b = buildMosaicRoastingBattle('A', 'B');
    if (b.tally.a > b.tally.b) {
      expect(b.winner).toBe('A');
    } else if (b.tally.b > b.tally.a) {
      expect(b.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(b.winner);
    }
  });

  it('is deterministic for the same input pair', () => {
    const a = buildMosaicRoastingBattle('A', 'B');
    const b = buildMosaicRoastingBattle('A', 'B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('returns 4 distinct persona ids', () => {
    const b = buildMosaicRoastingBattle('A', 'B');
    const ids = b.critiques.map((c) => c.personaId);
    expect(new Set(ids).size).toBe(4);
  });

  it('trims whitespace from inputs', () => {
    const b = buildMosaicRoastingBattle('  A  ', '  B  ');
    expect(b.outputA).toBe('A');
    expect(b.outputB).toBe('B');
  });
});

describe('mosaicRoastingBattleShareUrl', () => {
  it('encodes both inputs into the query string', () => {
    const url = mosaicRoastingBattleShareUrl('https://x', 'A', 'B');
    expect(url).toContain('/persona-mosaic-roasting-battle');
    expect(url).toContain('a=A');
    expect(url).toContain('b=B');
  });
});