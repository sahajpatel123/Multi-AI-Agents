/**
 * Tests for Persona Council data + deliberation engine.
 *
 * The Council page is the 16-mind deliberation at /persona-council.
 * It depends on:
 *  - buildCouncil returning one take per persona (16 total)
 *  - every take referencing a real persona id
 *  - takes being deterministic for the same question
 *  - stance summary counts summing to 16
 *  - dominantStance returning the mode of the summary
 *  - share URL encoding the question
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  buildCouncil,
  clearCouncilCounter,
  councilShareUrl,
  councilValid,
  dominantStance,
  incrementCouncilCounter,
  readCouncilCounter,
} from './personaCouncil';

const VALID_STANCES = new Set(['agrees', 'cautions', 'reframes', 'pushes', 'listens']);

describe('buildCouncil', () => {
  it('returns 16 takes, one per persona', () => {
    const c = buildCouncil('What is the meaning of life?');
    expect(c.takes).toHaveLength(PERSONAS.length);
  });

  it('every take references a real persona', () => {
    const c = buildCouncil('Sample question');
    expect(councilValid(c)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const t of c.takes) {
      expect(known.has(t.personaId)).toBe(true);
    }
  });

  it('every take has a stance in the closed set', () => {
    const c = buildCouncil('Sample question');
    for (const t of c.takes) {
      expect(VALID_STANCES.has(t.stance)).toBe(true);
    }
  });

  it('stance summary counts sum to 16', () => {
    const c = buildCouncil('Any question works.');
    const sum =
      c.summary.agrees +
      c.summary.cautions +
      c.summary.reframes +
      c.summary.pushes +
      c.summary.listens;
    expect(sum).toBe(16);
  });

  it('is deterministic for the same question', () => {
    const a = buildCouncil('A fixed test question.');
    const b = buildCouncil('A fixed test question.');
    expect(a.takes.map((t) => `${t.personaId}:${t.take}`)).toEqual(
      b.takes.map((t) => `${t.personaId}:${t.take}`),
    );
  });

  it('produces different takes for different questions', () => {
    const a = buildCouncil('Question A');
    const b = buildCouncil('Question B');
    // Stances likely differ across at least a few personas.
    let diffCount = 0;
    for (let i = 0; i < a.takes.length; i++) {
      if (a.takes[i].stance !== b.takes[i].stance) diffCount += 1;
    }
    expect(diffCount).toBeGreaterThan(0);
  });
});

describe('dominantStance', () => {
  it('returns the most common stance', () => {
    const c = buildCouncil('Any question');
    const dom = dominantStance(c);
    expect(dom).not.toBeNull();
    if (dom) {
      // The dominant count must be >= any other count.
      const counts = Object.values(c.summary);
      expect(c.summary[dom]).toBe(Math.max(...counts));
    }
  });

  it('returns null for an empty council', () => {
    expect(dominantStance({ question: '', takes: [], summary: {
      agrees: 0, cautions: 0, reframes: 0, pushes: 0, listens: 0,
    } })).toBeNull();
  });
});

describe('councilShareUrl', () => {
  it('encodes the question into a query string', () => {
    const url = councilShareUrl('https://x', 'What is focus?');
    expect(url).toContain('/persona-council');
    expect(url).toContain('q=What%20is%20focus%3F');
  });
});

describe('council counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearCouncilCounter();
    expect(readCouncilCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearCouncilCounter();
    expect(incrementCouncilCounter()).toBe(1);
    expect(incrementCouncilCounter()).toBe(2);
    expect(incrementCouncilCounter()).toBe(3);
  });

  it('clearCouncilCounter resets to 0', () => {
    incrementCouncilCounter();
    incrementCouncilCounter();
    clearCouncilCounter();
    expect(readCouncilCounter()).toBe(0);
  });
});
