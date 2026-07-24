/**
 * Tests for Persona Speed Round data + scoring.
 *
 * Speed Round is the 60-second arcade quiz at /persona-speed. It
 * depends on:
 *  - exactly 10 questions per round
 *  - every question having 4 options (1 correct + 3 distractors)
 *  - correct persona ids existing in the catalog
 *  - distractors distinct from correct + each other
 *  - scoring speed bonus scaling linearly with elapsed time
 *  - verdict copy scaling with score ratio
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  SPEED_BASE_POINTS,
  SPEED_MAX_SPEED_BONUS,
  SPEED_QUESTION_COUNT,
  SPEED_TOTAL_SECONDS,
  buildSpeedQuestions,
  comboMultiplier,
  computeSpeedPoints,
  maxStreak,
  speedVerdict,
  streakAtEachAnswer,
  type PersonaSpeedQuestion,
} from './personaSpeed';

describe('buildSpeedQuestions', () => {
  it(`returns exactly ${SPEED_QUESTION_COUNT} questions`, () => {
    expect(buildSpeedQuestions()).toHaveLength(SPEED_QUESTION_COUNT);
  });

  it('every question has a non-empty quote', () => {
    for (const q of buildSpeedQuestions()) {
      expect(q.quote.length).toBeGreaterThan(8);
    }
  });

  it('every question has 4 options', () => {
    for (const q of buildSpeedQuestions()) {
      expect(q.options).toHaveLength(4);
    }
  });

  it('every question id is unique', () => {
    const ids = buildSpeedQuestions().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every correctId exists in the catalog', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const q of buildSpeedQuestions()) {
      expect(known.has(q.correctId)).toBe(true);
    }
  });

  it('every option is unique and exists in the catalog', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const q of buildSpeedQuestions()) {
      expect(new Set(q.options).size).toBe(q.options.length);
      for (const id of q.options) {
        expect(known.has(id)).toBe(true);
      }
    }
  });

  it('the correctId is always present in options', () => {
    for (const q of buildSpeedQuestions()) {
      expect(q.options).toContain(q.correctId);
    }
  });
});

describe('computeSpeedPoints', () => {
  it('returns 0 for wrong answers', () => {
    expect(computeSpeedPoints(false, 0)).toBe(0);
    expect(computeSpeedPoints(false, 30_000)).toBe(0);
  });

  it('returns base + max bonus for instant correct', () => {
    expect(computeSpeedPoints(true, 0)).toBe(SPEED_BASE_POINTS + SPEED_MAX_SPEED_BONUS);
  });

  it('returns just base for correct at the time budget', () => {
    expect(computeSpeedPoints(true, SPEED_TOTAL_SECONDS * 1000)).toBe(SPEED_BASE_POINTS);
  });

  it('clamps above the budget to the base score', () => {
    expect(computeSpeedPoints(true, 999_999)).toBe(SPEED_BASE_POINTS);
  });

  it('linearly interpolates between instant and budget boundary', () => {
    const halfway = computeSpeedPoints(true, (SPEED_TOTAL_SECONDS * 1000) / 2);
    expect(halfway).toBe(SPEED_BASE_POINTS + Math.round(SPEED_MAX_SPEED_BONUS / 2));
  });
});

describe('speedVerdict', () => {
  it('returns a non-empty string for any score > 0', () => {
    for (const score of [0, 100, 500, 1000, 1500, 2000]) {
      expect(speedVerdict(score, 10).length).toBeGreaterThan(0);
    }
  });

  it('returns empty string when total is 0', () => {
    expect(speedVerdict(0, 0)).toBe('');
  });
});

describe('comboMultiplier', () => {
  it('returns 1.0 below streak 3', () => {
    expect(comboMultiplier(0)).toBe(1.0);
    expect(comboMultiplier(1)).toBe(1.0);
    expect(comboMultiplier(2)).toBe(1.0);
  });

  it('returns 1.5 at streak 3-4', () => {
    expect(comboMultiplier(3)).toBe(1.5);
    expect(comboMultiplier(4)).toBe(1.5);
  });

  it('returns 2.0 at streak 5-6', () => {
    expect(comboMultiplier(5)).toBe(2.0);
    expect(comboMultiplier(6)).toBe(2.0);
  });

  it('returns 3.0 at streak 7+', () => {
    expect(comboMultiplier(7)).toBe(3.0);
    expect(comboMultiplier(10)).toBe(3.0);
    expect(comboMultiplier(100)).toBe(3.0);
  });
});

describe('streakAtEachAnswer', () => {
  const qs: ReadonlyArray<PersonaSpeedQuestion> = [
    { id: 'a', quote: '', correctId: 'analyst', options: ['analyst', 'optimist', 'stoic', 'engineer'] },
    { id: 'b', quote: '', correctId: 'optimist', options: ['optimist', 'analyst', 'stoic', 'engineer'] },
    { id: 'c', quote: '', correctId: 'stoic', options: ['stoic', 'analyst', 'optimist', 'engineer'] },
    { id: 'd', quote: '', correctId: 'engineer', options: ['engineer', 'analyst', 'optimist', 'stoic'] },
    { id: 'e', quote: '', correctId: 'contrarian', options: ['contrarian', 'analyst', 'optimist', 'stoic'] },
  ];

  it('all correct produces 1,2,3,4,5 streaks', () => {
    expect(streakAtEachAnswer(qs, {
      a: 'analyst',
      b: 'optimist',
      c: 'stoic',
      d: 'engineer',
      e: 'contrarian',
    })).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });

  it('a wrong answer resets the streak to 0 then 1', () => {
    expect(streakAtEachAnswer(qs, {
      a: 'analyst',  // correct, streak 1
      b: 'analyst',  // wrong (correctId is optimist), streak 0
      c: 'stoic',    // correct, streak 1
    })).toEqual({ a: 1, b: 0, c: 1 });
  });

  it('unanswered questions are skipped, not counted', () => {
    expect(streakAtEachAnswer(qs, {
      a: 'analyst',
      // b not answered
      c: 'stoic',
    })).toEqual({ a: 1, c: 2 });
  });

  it('empty answers returns empty object', () => {
    expect(streakAtEachAnswer(qs, {})).toEqual({});
  });
});

describe('maxStreak', () => {
  const qs: ReadonlyArray<PersonaSpeedQuestion> = [
    { id: 'a', quote: '', correctId: 'analyst', options: ['analyst', 'optimist', 'stoic', 'engineer'] },
    { id: 'b', quote: '', correctId: 'optimist', options: ['optimist', 'analyst', 'stoic', 'engineer'] },
    { id: 'c', quote: '', correctId: 'stoic', options: ['stoic', 'analyst', 'optimist', 'engineer'] },
    { id: 'd', quote: '', correctId: 'engineer', options: ['engineer', 'analyst', 'optimist', 'stoic'] },
    { id: 'e', quote: '', correctId: 'contrarian', options: ['contrarian', 'analyst', 'optimist', 'stoic'] },
  ];

  it('returns 0 for all wrong', () => {
    expect(maxStreak(qs, {
      a: 'optimist',
      b: 'analyst',
      c: 'engineer',
    })).toBe(0);
  });

  it('returns the longest consecutive run', () => {
    expect(maxStreak(qs, {
      a: 'analyst',     // 1
      b: 'optimist',    // 2
      c: 'stoic',       // 3
      d: 'analyst',     // wrong, reset
      e: 'contrarian',  // 1
    })).toBe(3);
  });

  it('returns 0 for empty answers', () => {
    expect(maxStreak(qs, {})).toBe(0);
  });

  it('counts consecutive correct at the end', () => {
    expect(maxStreak(qs, {
      a: 'analyst',
      b: 'analyst',     // wrong, reset
      c: 'stoic',       // 1
      d: 'engineer',    // 2
      e: 'contrarian',  // 3
    })).toBe(3);
  });
});