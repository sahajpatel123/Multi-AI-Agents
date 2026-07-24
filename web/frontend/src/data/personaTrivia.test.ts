/**
 * Tests for Persona Trivia data + scoring.
 *
 * The trivia page is the cast-knowledge quiz at /persona-trivia. The
 * quiz depends on:
 *  - exactly 10 questions per round
 *  - every question having 4 options (1 correct + 3 distractors)
 *  - the correct persona id existing in the catalog
 *  - distractors being distinct from the correct id
 *  - scoring correctly tallying right answers
 *  - verdict copy scaling with score ratio
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  buildTriviaQuestions,
  scoreTrivia,
  triviaScorePercent,
  triviaVerdict,
  type PersonaTriviaQuestion,
} from './personaTrivia';

describe('buildTriviaQuestions', () => {
  it('returns 10 questions', () => {
    expect(buildTriviaQuestions()).toHaveLength(10);
  });

  it('every question has a non-empty quote', () => {
    for (const q of buildTriviaQuestions()) {
      expect(q.quote.length).toBeGreaterThan(8);
    }
  });

  it('every question has exactly 3 distractors', () => {
    for (const q of buildTriviaQuestions()) {
      expect(q.distractors).toHaveLength(3);
    }
  });

  it('every question id is unique', () => {
    const ids = buildTriviaQuestions().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every correctId exists in the PERSONAS catalog', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const q of buildTriviaQuestions()) {
      expect(known.has(q.correctId)).toBe(true);
    }
  });

  it('every distractor exists in the catalog and is not the correctId', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const q of buildTriviaQuestions()) {
      for (const d of q.distractors) {
        expect(known.has(d)).toBe(true);
        expect(d).not.toBe(q.correctId);
      }
    }
  });

  it('every distractor set is unique (no duplicates within a question)', () => {
    for (const q of buildTriviaQuestions()) {
      expect(new Set(q.distractors).size).toBe(q.distractors.length);
    }
  });
});

describe('scoreTrivia', () => {
  const sample: ReadonlyArray<PersonaTriviaQuestion> = [
    {
      id: 'a',
      quote: 'q',
      correctId: 'analyst',
      distractors: ['optimist', 'stoic', 'engineer'],
    },
    {
      id: 'b',
      quote: 'q',
      correctId: 'contrarian',
      distractors: ['empath', 'philosopher', 'historian'],
    },
    {
      id: 'c',
      quote: 'q',
      correctId: 'optimist',
      distractors: ['pragmatist', 'futurist', 'ethicist'],
    },
  ];

  it('returns 0 when no answers are given', () => {
    expect(scoreTrivia(sample, {})).toBe(0);
  });

  it('counts all correct', () => {
    expect(
      scoreTrivia(sample, { a: 'analyst', b: 'contrarian', c: 'optimist' }),
    ).toBe(3);
  });

  it('counts partial correct', () => {
    expect(
      scoreTrivia(sample, {
        a: 'analyst',
        b: 'empath',
        c: 'optimist',
      }),
    ).toBe(2);
  });

  it('counts all wrong', () => {
    expect(
      scoreTrivia(sample, {
        a: 'optimist',
        b: 'empath',
        c: 'pragmatist',
      }),
    ).toBe(0);
  });

  it('ignores answers for unknown question ids', () => {
    expect(
      scoreTrivia(sample, { a: 'analyst', bogus: 'whatever' }),
    ).toBe(1);
  });
});

describe('triviaVerdict', () => {
  it('returns a non-empty string for any score', () => {
    for (const score of [0, 1, 3, 5, 7, 9, 10]) {
      expect(triviaVerdict(score, 10).length).toBeGreaterThan(0);
    }
  });

  it('handles zero total gracefully', () => {
    expect(triviaVerdict(0, 0)).toBeTypeOf('string');
  });
});

describe('triviaScorePercent', () => {
  it('returns 0 for 0 of 0', () => {
    expect(triviaScorePercent(0, 0)).toBe(0);
  });

  it('returns 50 for half right', () => {
    expect(triviaScorePercent(5, 10)).toBe(50);
  });

  it('returns 100 for all right', () => {
    expect(triviaScorePercent(10, 10)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(triviaScorePercent(7, 10)).toBe(70);
    expect(triviaScorePercent(2, 3)).toBe(67);
  });
});