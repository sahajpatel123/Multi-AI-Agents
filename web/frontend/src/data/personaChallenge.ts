// Persona Challenge — daily-rotating "improve this prompt" surface.
// Pure helpers: deterministic daily challenge + severity diff scorer.

import { deriveRoastFlavor, roastSeverity, roastSeverityLabel } from './personaRoast';

export interface PersonaChallenge {
  readonly id: string;
  readonly prompt: string;
  readonly label: string;
  readonly hint: string;
  readonly expectedSeverity: number;
}

const CHALLENGE_POOL: ReadonlyArray<PersonaChallenge> = [
  {
    id: 'over-eager',
    prompt: 'Write me a viral tweet that will get 10k likes and also build a personal brand and also sell my consulting offer. Make it punchy.',
    label: 'The over-eager',
    hint: 'This prompt asks for ten things at once. Pick one.',
    expectedSeverity: 8,
  },
  {
    id: 'fog',
    prompt: 'Tell me about that thing we were talking about with the stuff and the whatever.',
    label: 'The fog',
    hint: 'Three vague nouns. None of them point to anything real.',
    expectedSeverity: 9,
  },
  {
    id: 'leading',
    prompt: "Don't you think remote work is just a way for managers to lose control of their teams?",
    label: 'The leading question',
    hint: 'The conclusion is in the question. The answer cannot surprise you.',
    expectedSeverity: 5,
  },
  {
    id: 'costume',
    prompt: 'Pretend you are a Nobel-winning economist from 1987. Answer in character. Use big words.',
    label: 'The costume',
    hint: 'You are asking for a performance, not an answer.',
    expectedSeverity: 5,
  },
  {
    id: 'wall-of-text',
    prompt: 'I want to launch a SaaS but I do not know what to build and I do not know who to sell it to and I do not know how to price it and I do not know what stack to use and I do not know if I should raise money and I do not know what to name it and I do not know how to write a landing page. Tell me everything.',
    label: 'The wall of text',
    hint: 'Ten questions in one breath. Cut nine.',
    expectedSeverity: 8,
  },
  {
    id: 'vague-thesis',
    prompt: 'Write me something interesting about AI.',
    label: 'The vague thesis',
    hint: '"Interesting" is not a brief. "AI" is not a topic. Pick a specific angle.',
    expectedSeverity: 8,
  },
  {
    id: 'meta-plea',
    prompt: 'Be my therapist and also my career coach and also my best friend and also my accountability partner. Tell me what to do with my life.',
    label: 'The meta plea',
    hint: 'You are asking four different people. Pick one.',
    expectedSeverity: 6,
  },
];

/** Pure — pick today's challenge by date. Stable across visitors. */
export function challengeOfTheDay(isoDate: string): PersonaChallenge {
  const [y, m, d] = isoDate.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return CHALLENGE_POOL[0];
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
  return CHALLENGE_POOL[dayIndex % CHALLENGE_POOL.length];
}

/** Pure — today's date as YYYY-MM-DD in local timezone. */
export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ChallengeResult {
  readonly before: number;
  readonly after: number;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly beforeFlavor: string;
  readonly afterFlavor: string;
  readonly improvement: number; // positive = improved
  readonly verdict: string;
  readonly passed: boolean;
}

/** Pure — compute the user's result against the challenge. */
export function scoreChallenge(
  challenge: PersonaChallenge,
  userSubmission: string,
): ChallengeResult {
  const before = roastSeverity(challenge.prompt);
  const after = roastSeverity(userSubmission);
  const improvement = before - after;
  const beforeFlavor = deriveRoastFlavor(challenge.prompt);
  const afterFlavor = deriveRoastFlavor(userSubmission);
  const passed = after <= 2; // "Sharp" or "Mostly fine"
  return {
    before,
    after,
    beforeLabel: roastSeverityLabel(before),
    afterLabel: roastSeverityLabel(after),
    beforeFlavor,
    afterFlavor,
    improvement,
    passed,
    verdict: challengeVerdict(improvement, passed),
  };
}

function challengeVerdict(improvement: number, passed: boolean): string {
  if (passed) return 'Sharp — this is a real prompt now.';
  if (improvement >= 5) return 'Massive improvement. You took a mess and made it land.';
  if (improvement >= 3) return 'Real progress. Two more rounds and you are sharp.';
  if (improvement >= 1) return 'A step in the right direction. Keep tightening.';
  if (improvement === 0) return 'No change. Try cutting one assumption first.';
  return 'You made it worse. Try the opposite — start with the answer, not the question.';
}

/** Build a shareable URL for a challenge result. */
export function challengeShareUrl(
  origin: string,
  challengeId: string,
  submission: string,
): string {
  return `${origin}/persona-challenge?c=${encodeURIComponent(challengeId)}&s=${encodeURIComponent(submission)}`;
}