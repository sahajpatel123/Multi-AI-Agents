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
  computeSpeedPoints,
  speedVerdict,
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