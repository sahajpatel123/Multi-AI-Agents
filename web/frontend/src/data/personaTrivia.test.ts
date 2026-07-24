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
  BASE_POINTS,
  MAX_SPEED_BONUS,
  appendTriviaHistory,
  buildTriviaQuestions,
  clearTriviaHistory,
  computeMaxStreak,
  computeQuestionPoints,
  readTriviaHistory,
  scoreTrivia,
  triviaScorePercent,
  triviaVerdict,
  type PersonaTriviaQuestion,
  type TriviaRoundEntry,
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

describe('computeQuestionPoints', () => {
  it('returns 0 for wrong answers', () => {
    expect(computeQuestionPoints(false, 0)).toBe(0);
    expect(computeQuestionPoints(false, 5_000)).toBe(0);
  });

  it('returns full base + max bonus for instant correct', () => {
    expect(computeQuestionPoints(true, 0)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
  });

  it('returns just base for correct at the budget boundary', () => {
    expect(computeQuestionPoints(true, 12_000)).toBe(BASE_POINTS);
  });

  it('linearly interpolates between instant and budget boundary', () => {
    const halfway = computeQuestionPoints(true, 6_000);
    expect(halfway).toBe(BASE_POINTS + Math.round(MAX_SPEED_BONUS / 2));
  });

  it('clamps elapsed above the budget to the base score', () => {
    expect(computeQuestionPoints(true, 999_999)).toBe(BASE_POINTS);
  });

  it('clamps negative elapsed to max bonus', () => {
    expect(computeQuestionPoints(true, -100)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
  });

  it('respects a custom budget', () => {
    // Custom 6s budget: instant correct = base + max bonus; at 6s = base only.
    expect(computeQuestionPoints(true, 0, 6_000)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
    expect(computeQuestionPoints(true, 6_000, 6_000)).toBe(BASE_POINTS);
  });
});

describe('computeMaxStreak', () => {
  it('returns 0 for all wrong', () => {
    expect(computeMaxStreak([{ correct: false }, { correct: false }])).toBe(0);
  });

  it('returns total length for all correct', () => {
    expect(
      computeMaxStreak([
        { correct: true },
        { correct: true },
        { correct: true },
      ]),
    ).toBe(3);
  });

  it('returns longest consecutive run', () => {
    expect(
      computeMaxStreak([
        { correct: false },
        { correct: true },
        { correct: true },
        { correct: true },
        { correct: false },
        { correct: true },
        { correct: true },
      ]),
    ).toBe(3);
  });

  it('handles empty input', () => {
    expect(computeMaxStreak([])).toBe(0);
  });
});

describe('trivia round history (localStorage)', () => {
  const makeEntry = (id: string, score = 800): TriviaRoundEntry => ({
    id,
    score,
    total: 1500,
    maxStreak: 4,
    savedAt: new Date().toISOString(),
  });

  it('readTriviaHistory returns empty array when storage is empty', () => {
    clearTriviaHistory();
    expect(readTriviaHistory()).toEqual([]);
  });

  it('appendTriviaHistory + readTriviaHistory round-trip', () => {
    clearTriviaHistory();
    const entry = makeEntry('round-1');
    appendTriviaHistory(entry);
    const result = readTriviaHistory();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('round-1');
    expect(result[0].score).toBe(800);
  });

  it('appendTriviaHistory deduplicates by id', () => {
    clearTriviaHistory();
    appendTriviaHistory(makeEntry('dup', 700));
    appendTriviaHistory(makeEntry('dup', 950));
    const result = readTriviaHistory();
    expect(result.length).toBe(1);
    expect(result[0].score).toBe(950);
  });

  it('appendTriviaHistory caps the stored list at 10 entries', () => {
    clearTriviaHistory();
    for (let i = 0; i < 15; i++) {
      appendTriviaHistory(makeEntry(`round-${i}`, 100 + i));
    }
    expect(readTriviaHistory().length).toBeLessThanOrEqual(10);
  });

  it('clearTriviaHistory empties storage', () => {
    appendTriviaHistory(makeEntry('x'));
    clearTriviaHistory();
    expect(readTriviaHistory()).toEqual([]);
  });
});