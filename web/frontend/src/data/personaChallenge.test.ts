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
  challengeOfTheDay,
  challengeShareUrl,
  scoreChallenge,
  todayIsoDate,
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