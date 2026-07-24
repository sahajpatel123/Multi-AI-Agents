// Persona Trivia — pure data for the "which persona said this?" quiz.
// All quotes come from the canonical PERSONAS catalog, so the quiz can
// never reference a persona that the backend can't dispatch.

import { PERSONAS } from './personas';

export interface PersonaTriviaQuestion {
  readonly id: string;
  readonly quote: string;
  readonly correctId: string;
  readonly distractors: ReadonlyArray<string>;
}

const QUOTE_TO_PERSONA: Record<string, string> = {
  'I find the flaw in everything.': 'analyst',
  'I question the premise first.': 'philosopher',
  'I only care what actually works.': 'pragmatist',
  'I say what no one else will.': 'contrarian',
  'I show you what the data actually says.': 'scientist',
  'I name the precedent before any broader point.': 'historian',
  'I trace the incentives before the conclusion.': 'economist',
  'I apply every framework, then name who pays.': 'ethicist',
  'I separate what is in your control from what is not.': 'stoic',
  'I extrapolate the trajectory and name the second-order effect.': 'futurist',
  'I find the asymmetric move.': 'strategist',
  'I name the constraint and the failure mode.': 'engineer',
  'I name the mechanism of good outcomes.': 'optimist',
  'I name the people the framing left out.': 'empath',
  'I take every assumption down to bedrock.': 'firstprinciples',
  'I steelman the contrary position.': 'devilsadvocate',
};

function pickDistractors(correctId: string, count: number): ReadonlyArray<string> {
  const pool = PERSONAS.map((p) => p.id).filter((id) => id !== correctId);
  // Fisher-Yates partial shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * Build the trivia question set. Pure — depends only on the persona
 * catalog and Math.random for distractor variety. Returns 10 questions
 * with 3 distractors each, in randomized distractor order.
 */
export function buildTriviaQuestions(): ReadonlyArray<PersonaTriviaQuestion> {
  const entries = Object.entries(QUOTE_TO_PERSONA);
  // Shuffle the question order for variety.
  const indices = entries.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = indices.slice(0, 10);
  return picked.map((idx, qIndex) => {
    const [quote, correctId] = entries[idx];
    const distractors = pickDistractors(correctId, 3);
    return {
      id: `q-${qIndex}-${correctId}`,
      quote,
      correctId,
      distractors,
    };
  });
}

/**
 * Pure scoring helper — returns the number of correct answers given
 * the user's answers. An answer is correct when the picked option id
 * matches the question's correctId.
 */
export function scoreTrivia(
  questions: ReadonlyArray<PersonaTriviaQuestion>,
  answers: Readonly<Record<string, string>>,
): number {
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctId) correct++;
  }
  return correct;
}

/** Map a score (0..10) to a persona-flavored verdict label. */
export function triviaVerdict(score: number, total: number): string {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.9) return 'Verifier mind — you read every quote like a primary source.';
  if (ratio >= 0.7) return 'Skeptic mind — the data backs you up.';
  if (ratio >= 0.5) return 'Curious mind — keep spinning the wheel to learn the rest.';
  if (ratio >= 0.3) return 'Rookie mind — you found a few, the others are coming.';
  return 'Fresh recruit — every Arena mind has more to teach you.';
}

/** Map a score to a 0-100 confidence percentage for the share card. */
export function triviaScorePercent(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}