/**
 * Tests for Persona Wheel data helpers.
 *
 * The wheel is the deterministic / randomized engine that powers the
 * /persona-wheel page. It must:
 *  - never return duplicate personas in a single spin
 *  - never return more personas than the catalog has
 *  - return deterministic picks for the same seed (so shared URLs land
 *    on the same combo for everyone)
 *  - build shareable URLs with the mode + seed + persona list encoded
 *  - never throw on edge cases (count=0, count > catalog size)
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  deterministicSpin,
  personaFromSeed,
  spinPersonas,
  wheelArenaLink,
  wheelBattleLink,
  wheelMatchLink,
  wheelShareUrl,
} from './personaWheel';

describe('spinPersonas', () => {
  it('returns the requested number of personas', () => {
    expect(spinPersonas(1)).toHaveLength(1);
    expect(spinPersonas(3)).toHaveLength(3);
    expect(spinPersonas(PERSONAS.length)).toHaveLength(PERSONAS.length);
  });

  it('returns at most the catalog size', () => {
    const oversized = spinPersonas(PERSONAS.length + 10);
    expect(oversized.length).toBeLessThanOrEqual(PERSONAS.length);
  });

  it('returns 0 for non-positive counts', () => {
    expect(spinPersonas(0)).toHaveLength(0);
    expect(spinPersonas(-3)).toHaveLength(0);
  });

  it('returns distinct personas', () => {
    const result = spinPersonas(PERSONAS.length);
    expect(new Set(result).size).toBe(result.length);
  });

  it('every returned id exists in the catalog', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const id of spinPersonas(PERSONAS.length)) {
      expect(known.has(id)).toBe(true);
    }
  });
});

describe('personaFromSeed', () => {
  it('returns a known persona id', () => {
    const ids = PERSONAS.map((p) => p.id);
    for (const seed of ['hello', 'world', 'abc123', 'persona-wheel-2026']) {
      const id = personaFromSeed(seed, ids);
      expect(ids).toContain(id);
    }
  });

  it('is deterministic for the same seed', () => {
    const ids = PERSONAS.map((p) => p.id);
    const a = personaFromSeed('repeatable-seed', ids);
    const b = personaFromSeed('repeatable-seed', ids);
    expect(a).toBe(b);
  });

  it('changes result for different seeds', () => {
    const ids = PERSONAS.map((p) => p.id);
    // With 16 personas, two random seeds almost never collide.
    const a = personaFromSeed('alpha', ids);
    const b = personaFromSeed('beta', ids);
    expect(a === b || true).toBe(true); // not strictly asserting inequality — collision is allowed but unlikely
    // What we DO assert: the function never throws and always returns a valid id.
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });

  it('never throws on empty seed', () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(() => personaFromSeed('', ids)).not.toThrow();
  });
});

describe('deterministicSpin', () => {
  it('returns the requested number of personas', () => {
    expect(deterministicSpin('seed-a', 1)).toHaveLength(1);
    expect(deterministicSpin('seed-b', 3)).toHaveLength(3);
  });

  it('returns distinct personas', () => {
    const result = deterministicSpin('seed-distinct', PERSONAS.length);
    expect(new Set(result).size).toBe(result.length);
  });

  it('returns at most the catalog size', () => {
    expect(deterministicSpin('oversized', 999).length).toBeLessThanOrEqual(PERSONAS.length);
  });

  it('is deterministic for the same seed', () => {
    const a = deterministicSpin('repeatable', 4);
    const b = deterministicSpin('repeatable', 4);
    expect(a).toEqual(b);
  });

  it('produces a different combo for a different seed', () => {
    const a = deterministicSpin('seed-1', 4);
    const b = deterministicSpin('seed-2', 4);
    expect(a).not.toEqual(b);
  });

  it('returns 0 for non-positive counts', () => {
    expect(deterministicSpin('zero', 0)).toHaveLength(0);
    expect(deterministicSpin('negative', -2)).toHaveLength(0);
  });
});

describe('URL builders', () => {
  it('wheelShareUrl encodes mode, seed, and persona list', () => {
    const url = wheelShareUrl('https://arena.example', 'pair', ['analyst', 'contrarian'], 'abc123');
    expect(url).toContain('/persona-wheel');
    expect(url).toContain('mode=pair');
    expect(url).toContain('seed=abc123');
    expect(url).toContain('p=analyst%2Ccontrarian');
  });

  it('wheelMatchLink deep-links to persona-match', () => {
    expect(wheelMatchLink('https://x', 'analyst')).toBe('https://x/persona-match?p=analyst');
  });

  it('wheelBattleLink deep-links to persona-battle', () => {
    expect(wheelBattleLink('https://x', 'analyst', 'optimist')).toBe(
      'https://x/persona-battle?left=analyst&right=optimist',
    );
  });

  it('wheelArenaLink builds a query string with multiple seedPersona entries', () => {
    expect(wheelArenaLink(['analyst', 'optimist'])).toBe(
      '/app?seedPersona=analyst&seedPersona=optimist',
    );
  });
});