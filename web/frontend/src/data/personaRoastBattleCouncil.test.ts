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
  buildRoastBattleCouncil,
  roastBattleCouncilShareUrl,
  roastBattleCouncilValid,
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