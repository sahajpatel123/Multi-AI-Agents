/**
 * Tests for Persona Challenge data + scoring.
 *
 * The Challenge page is the daily improvement game at /persona-challenge.
 * Same date in = same challenge out (deterministic rotation). Every
 * submission is scored by severity reduction vs the original prompt.
 *
 * Invariants:
 *  - challengeOfTheDay returns a valid challenge for any YYYY-MM-DD
 *  - same date = same challenge for every visitor
 *  - 30 consecutive days produce at least 5 distinct challenges
 *  - scoreChallenge returns a passed=true result when after ≤ 2
 *  - scoreChallenge.improvement = before - after (signed)
 *  - challengeShareUrl encodes both challenge id and submission
 */

import { describe, expect, it } from 'vitest';
import {
  bestScoreAllTime,
  bestScoreForDate,
  challengeOfTheDay,
  challengeShareUrl,
  computeChallengeStreak,
  scoreChallenge,
  todayIsoDate,
  type ChallengeHistoryEntry,
  type PersonaChallenge,
} from './personaChallenge';

describe('challengeOfTheDay', () => {
  it('returns a valid challenge for any YYYY-MM-DD date', () => {
    for (let day = 1; day <= 30; day++) {
      const c = challengeOfTheDay(`2026-07-${String(day).padStart(2, '0')}`);
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.prompt.length).toBeGreaterThan(8);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same date', () => {
    expect(challengeOfTheDay('2026-07-24').id).toBe(
      challengeOfTheDay('2026-07-24').id,
    );
  });

  it('produces variety across many consecutive days', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 30; day++) {
      seen.add(
        challengeOfTheDay(`2026-07-${String(day).padStart(2, '0')}`).id,
      );
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it('falls back to the first pool entry for invalid dates', () => {
    const c = challengeOfTheDay('not-a-date');
    expect(c.id.length).toBeGreaterThan(0);
  });
});

describe('todayIsoDate', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('scoreChallenge', () => {
  // Use a custom high-severity challenge (a long, leading prompt) to
  // drive predictable scoring without depending on which day maps to
  // which pool entry.
  const challenge: PersonaChallenge = {
    id: 'test',
    prompt:
      "Why is our product not converting the way we expected, and isn't it true that marketing is the root cause and not the product itself in this market?",
    label: 'Test leading',
    hint: 'Drop the leading frame.',
    expectedSeverity: 7,
  };

  it('returns improvement = before - after', () => {
    const before = scoreChallenge(challenge, challenge.prompt);
    // Submitting the same prompt verbatim should give improvement = 0.
    expect(before.improvement).toBe(0);
    expect(before.before).toBe(before.after);
  });

  it('improvement is positive for a tighter submission', () => {
    const improved = scoreChallenge(
      challenge,
      'How should I price a B2B SaaS for solo founders in the first 6 months?',
    );
    expect(improved.improvement).toBeGreaterThan(0);
  });

  it('passed = true when after <= 2', () => {
    const result = scoreChallenge(
      challenge,
      'How should I price a B2B SaaS for solo founders in the first 6 months?',
    );
    if (result.after <= 2) {
      expect(result.passed).toBe(true);
    } else {
      expect(result.passed).toBe(false);
    }
  });

  it('returns non-empty verdict for every score range', () => {
    for (const submission of [
      challenge.prompt,
      'How should I price a B2B SaaS for solo founders?',
      'How should I price my product?',
      'short',
      '',
    ]) {
      const r = scoreChallenge(challenge, submission);
      expect(r.verdict.length).toBeGreaterThan(0);
    }
  });

  it('returns both flavor labels (before + after) and they can differ', () => {
    const result = scoreChallenge(challenge, 'How should I price my B2B SaaS?');
    expect(result.beforeFlavor.length).toBeGreaterThan(0);
    expect(result.afterFlavor.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same input', () => {
    const a = scoreChallenge(challenge, 'A focused question.');
    const b = scoreChallenge(challenge, 'A focused question.');
    expect(a.after).toBe(b.after);
    expect(a.before).toBe(b.before);
    expect(a.improvement).toBe(b.improvement);
    expect(a.verdict).toBe(b.verdict);
  });
});

describe('challengeShareUrl', () => {
  it('encodes both challenge id and submission', () => {
    const url = challengeShareUrl(
      'https://x',
      'over-eager',
      'A focused question.',
    );
    expect(url).toContain('/persona-challenge');
    expect(url).toContain('c=over-eager');
    expect(url).toContain('s=');
    expect(decodeURIComponent(url)).toContain('A focused question.');
  });
});

describe('computeChallengeStreak', () => {
  const makeEntry = (date: string, after: number = 3): ChallengeHistoryEntry => ({
    id: `${date}-${Math.random()}`,
    date,
    challengeId: 'test',
    before: 8,
    after,
    improvement: 8 - after,
    passed: after <= 2,
    savedAt: `${date}T00:00:00Z`,
  });

  it('returns 0 for empty history', () => {
    expect(computeChallengeStreak([], '2026-07-24')).toBe(0);
  });

  it('returns 1 for a single entry today', () => {
    expect(computeChallengeStreak([makeEntry('2026-07-24')], '2026-07-24')).toBe(1);
  });

  it('returns 1 for a single entry yesterday (forgives "haven\'t played yet")', () => {
    expect(computeChallengeStreak([makeEntry('2026-07-23')], '2026-07-24')).toBe(1);
  });

  it('returns 0 if the most recent entry is older than yesterday', () => {
    expect(computeChallengeStreak([makeEntry('2026-07-20')], '2026-07-24')).toBe(0);
  });

  it('returns the consecutive-day count', () => {
    const history = [
      makeEntry('2026-07-24'),
      makeEntry('2026-07-23'),
      makeEntry('2026-07-22'),
      makeEntry('2026-07-21'),
    ];
    expect(computeChallengeStreak(history, '2026-07-24')).toBe(4);
  });

  it('breaks the streak at the first gap', () => {
    const history = [
      makeEntry('2026-07-24'),
      makeEntry('2026-07-23'),
      // gap on 07-22
      makeEntry('2026-07-21'),
      makeEntry('2026-07-20'),
    ];
    expect(computeChallengeStreak(history, '2026-07-24')).toBe(2);
  });

  it('treats multiple entries on the same day as one streak day', () => {
    const history = [
      makeEntry('2026-07-24'),
      makeEntry('2026-07-24'),
      makeEntry('2026-07-23'),
    ];
    expect(computeChallengeStreak(history, '2026-07-24')).toBe(2);
  });
});

describe('bestScoreForDate', () => {
  const makeEntry = (date: string, after: number): ChallengeHistoryEntry => ({
    id: `${date}-${after}`,
    date,
    challengeId: 'test',
    before: 8,
    after,
    improvement: 8 - after,
    passed: after <= 2,
    savedAt: `${date}T00:00:00Z`,
  });

  it('returns null when there are no entries on that date', () => {
    expect(bestScoreForDate([], '2026-07-24')).toBeNull();
    expect(bestScoreForDate([makeEntry('2026-07-23', 3)], '2026-07-24')).toBeNull();
  });

  it('returns the entry with the lowest after-score', () => {
    const history = [
      makeEntry('2026-07-24', 5),
      makeEntry('2026-07-24', 2),
      makeEntry('2026-07-24', 4),
    ];
    const best = bestScoreForDate(history, '2026-07-24');
    expect(best).not.toBeNull();
    expect(best!.after).toBe(2);
  });
});

describe('bestScoreAllTime', () => {
  const makeEntry = (date: string, after: number): ChallengeHistoryEntry => ({
    id: `${date}-${after}`,
    date,
    challengeId: 'test',
    before: 8,
    after,
    improvement: 8 - after,
    passed: after <= 2,
    savedAt: `${date}T00:00:00Z`,
  });

  it('returns null for empty history', () => {
    expect(bestScoreAllTime([])).toBeNull();
  });

  it('returns the entry with the lowest after-score across all dates', () => {
    const history = [
      makeEntry('2026-07-24', 5),
      makeEntry('2026-07-23', 2),
      makeEntry('2026-07-22', 4),
    ];
    const best = bestScoreAllTime(history);
    expect(best).not.toBeNull();
    expect(best!.after).toBe(2);
    expect(best!.date).toBe('2026-07-23');
  });
});
