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
  buildMosaicDilemmaCouncil,
  mosaicDilemmaCouncilShareUrl,
  mosaicDilemmaCouncilValid,
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