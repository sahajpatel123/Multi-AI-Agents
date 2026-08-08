/**
 * Tests for the Persona Match quiz scoring engine.
 *
 * `data/personaMatch.ts` is the pure scoring backbone of the public
 * /persona-match page. The page UI depends on:
 *  - exactly 5 questions (5 is wired into the progress bar copy)
 *  - every question having multiple options that score against personas
 *  - scoring producing a deterministic top match
 *  - answering nothing returning no result
 *  - duplicate option ids being prevented
 *  - weights being positive integers
 *
 * Pinning these invariants prevents the quiz from regressing silently
 * (e.g. somebody removing a question and not noticing the progress bar
 * shows "5 / 4 answered").
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  PERSONA_MATCH_QUESTIONS,
  scorePersonaMatch,
  topPersonaMatch,
} from './personaMatch';

describe('PERSONA_MATCH_QUESTIONS catalog', () => {
  it('contains exactly 5 questions', () => {
    expect(PERSONA_MATCH_QUESTIONS).toHaveLength(5);
  });

  it('every question has a unique id', () => {
    const ids = PERSONA_MATCH_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question has a non-empty prompt and helper', () => {
    for (const q of PERSONA_MATCH_QUESTIONS) {
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.helper.length).toBeGreaterThan(0);
    }
  });

  it('every question has at least 3 options', () => {
    for (const q of PERSONA_MATCH_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every option has a unique id within its question', () => {
    for (const q of PERSONA_MATCH_QUESTIONS) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size, `duplicate option id in ${q.id}`).toBe(ids.length);
    }
  });

  it('every option has a non-empty label', () => {
    for (const q of PERSONA_MATCH_QUESTIONS) {
      for (const o of q.options) {
        expect(o.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('every weight is a positive integer', () => {
    for (const q of PERSONA_MATCH_QUESTIONS) {
      for (const o of q.options) {
        for (const [personaId, weight] of Object.entries(o.weights)) {
          expect(Number.isInteger(weight), `weight for ${personaId} in ${o.id} is integer`).toBe(true);
          expect(weight, `weight for ${personaId} in ${o.id} is positive`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every scored persona id exists in the PERSONAS catalog', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const q of PERSONA_MATCH_QUESTIONS) {
      for (const o of q.options) {
        for (const personaId of Object.keys(o.weights)) {
          expect(known.has(personaId), `unknown persona ${personaId} in ${q.id}/${o.id}`).toBe(true);
        }
      }
    }
  });
});

describe('scorePersonaMatch', () => {
  it('returns empty array when no answers are given', () => {
    expect(scorePersonaMatch({})).toEqual([]);
  });

  it('returns the weighted personas for a single answer', () => {
    const ranked = scorePersonaMatch({ q1_decision: 'analyze' });
    // 'analyze' option weights: analyst 3, scientist 2, engineer 1
    expect(ranked).toHaveLength(3);
    expect(ranked[0].personaId).toBe('analyst');
    expect(ranked[0].score).toBe(3);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].personaId).toBe('scientist');
    expect(ranked[1].score).toBe(2);
    expect(ranked[2].personaId).toBe('engineer');
    expect(ranked[2].score).toBe(1);
  });

  it('aggregates weights across questions', () => {
    // q1=analyze -> analyst 3, scientist 2, engineer 1
    // q3=complexity -> engineer 3, pragmatist 2, strategist 1
    const ranked = scorePersonaMatch({
      q1_decision: 'analyze',
      q3_priority: 'complexity',
    });
    // engineer: 1 + 3 = 4, analyst: 3, pragmatist: 2, scientist: 2, strategist: 1
    expect(ranked[0].personaId).toBe('engineer');
    expect(ranked[0].score).toBe(4);
    expect(ranked.find((r) => r.personaId === 'analyst')?.score).toBe(3);
  });

  it('ranks scores in descending order', () => {
    const ranked = scorePersonaMatch({
      q1_decision: 'analyze', // analyst 3, scientist 2, engineer 1
      q2_failure: 'evidence', // scientist 3, analyst 2, economist 1
    });
    // analyst: 3 + 2 = 5, scientist: 2 + 3 = 5, engineer: 1, economist: 1
    expect(ranked[0].score).toBe(5);
    expect(ranked[1].score).toBe(5);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    // Scores must be monotonically non-increasing.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  it('ignores answers for unknown question ids', () => {
    const ranked = scorePersonaMatch({
      q1_decision: 'analyze',
      unknown_question: 'whatever',
    });
    const ids = ranked.map((r) => r.personaId);
    expect(ids).toContain('analyst');
    expect(ids).toContain('scientist');
    expect(ids).toContain('engineer');
    expect(ids).not.toContain('whatever');
  });

  it('ignores answers for unknown option ids', () => {
    const ranked = scorePersonaMatch({
      q1_decision: 'analyze',
      q2_failure: 'bogus',
    });
    const ids = ranked.map((r) => r.personaId);
    expect(ids).toContain('analyst');
    expect(ids).toContain('scientist');
    expect(ids).toContain('engineer');
  });

  it('produces a deterministic top match for a fully-answered quiz', () => {
    // Walk through every question with the first option.
    const answers = Object.fromEntries(
      PERSONA_MATCH_QUESTIONS.map((q) => [q.id, q.options[0].id]),
    );
    const top = topPersonaMatch(answers);
    expect(top).not.toBeNull();
    expect(top!.rank).toBe(1);
    expect(top!.score).toBeGreaterThan(0);
  });

  it('every persona in the catalog is reachable from at least one option', () => {
    const reachable = new Set<string>();
    for (const q of PERSONA_MATCH_QUESTIONS) {
      for (const o of q.options) {
        for (const personaId of Object.keys(o.weights)) {
          reachable.add(personaId);
        }
      }
    }
    for (const p of PERSONAS) {
      expect(reachable.has(p.id), `${p.id} is unreachable from quiz`).toBe(true);
    }
  });
});

describe('topPersonaMatch', () => {
  it('returns null when no answers are given', () => {
    expect(topPersonaMatch({})).toBeNull();
  });

  it('returns the highest-scoring persona', () => {
    const top = topPersonaMatch({
      q1_decision: 'challenge', // contrarian 3 + devilsadvocate 2 + strategist 1
      q4_news: 'icy', // contrarian 3 + devilsadvocate 2 + scientist 1
    });
    // contrarian: 6, devilsadvocate: 4, strategist: 1, scientist: 1
    expect(top!.personaId).toBe('contrarian');
    expect(top!.score).toBe(6);
  });
});
