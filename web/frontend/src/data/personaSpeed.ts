// Persona Speed Round — pure data for the timed arcade quiz at
// /persona-speed. Uses the same quote → persona catalog as Persona
// Trivia but with a global 60s timer instead of per-question timing.

import { PERSONAS } from './personas';

export interface PersonaSpeedQuestion {
  readonly id: string;
  readonly quote: string;
  readonly correctId: string;
  readonly options: ReadonlyArray<string>;
}

const QUOTES: ReadonlyArray<readonly [string, string]> = [
  ['I find the flaw in everything.', 'analyst'],
  ['I question the premise first.', 'philosopher'],
  ['I only care what actually works.', 'pragmatist'],
  ['I say what no one else will.', 'contrarian'],
  ['I show you what the data actually says.', 'scientist'],
  ['I name the precedent before any broader point.', 'historian'],
  ['I trace the incentives before the conclusion.', 'economist'],
  ['I apply every framework, then name who pays.', 'ethicist'],
  ['I separate what is in your control from what is not.', 'stoic'],
  ['I extrapolate the trajectory and name the second-order effect.', 'futurist'],
  ['I find the asymmetric move.', 'strategist'],
  ['I name the constraint and the failure mode.', 'engineer'],
  ['I name the mechanism of good outcomes.', 'optimist'],
  ['I name the people the framing left out.', 'empath'],
  ['I take every assumption down to bedrock.', 'firstprinciples'],
  ["I steelman the contrary position.", 'devilsadvocate'],
];

export const SPEED_TOTAL_SECONDS = 60;
export const SPEED_QUESTION_COUNT = 10;
export const SPEED_BASE_POINTS = 100;
export const SPEED_MAX_SPEED_BONUS = 100;

/** Pure — build the speed round question set. */
export function buildSpeedQuestions(): ReadonlyArray<PersonaSpeedQuestion> {
  // Shuffle the quote list, pick SPEED_QUESTION_COUNT, build options.
  const indices = QUOTES.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = indices.slice(0, SPEED_QUESTION_COUNT);

  return picked.map((qIdx, qIndex) => {
    const [quote, correctId] = QUOTES[qIdx];
    // Pick 3 distractors.
    const pool = PERSONAS.map((p) => p.id).filter((id) => id !== correctId);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const distractors = pool.slice(0, 3);
    const options = [correctId, ...distractors].sort(() => Math.random() - 0.5);
    return {
      id: `sq-${qIndex}-${correctId}`,
      quote,
      correctId,
      options,
    };
  });
}

/**
 * Pure — compute points for one answered question given the elapsed
 * time since the round started. Faster = more bonus.
 */
export function computeSpeedPoints(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0;
  // The whole round is 60s; map elapsed time to a bonus 0..100.
  const totalMs = SPEED_TOTAL_SECONDS * 1000;
  const clamped = Math.max(0, Math.min(elapsedMs, totalMs));
  // Linear: instant answer → 100 bonus; full-time → 0 bonus.
  const speedFraction = 1 - clamped / totalMs;
  return SPEED_BASE_POINTS + Math.round(speedFraction * SPEED_MAX_SPEED_BONUS);
}

/** Map a score to a verdict line for the end card. */
export function speedVerdict(score: number, total: number): string {
  if (total <= 0) return '';
  const maxScore = total * (SPEED_BASE_POINTS + SPEED_MAX_SPEED_BONUS);
  const ratio = score / maxScore;
  if (ratio >= 0.85) return 'Reflex mind — the panel barely kept up with you.';
  if (ratio >= 0.65) return 'Tactician mind — fast fingers, sharper instincts.';
  if (ratio >= 0.45) return 'Athlete mind — a few more rounds and the leaderboard is yours.';
  if (ratio >= 0.25) return 'Rookie mind — speed is a skill you can train.';
  return 'Cold start — give it another go and the quotes will surface.';
}

// Combo bonus — consecutive correct answers stack a multiplier on top of
// the speed-bonus base. 1.0x below 3 streak, 1.5x at 3, 2x at 5, 3x at 7+.
// A wrong answer resets the streak.

export function comboMultiplier(streak: number): number {
  if (streak >= 7) return 3.0;
  if (streak >= 5) return 2.0;
  if (streak >= 3) return 1.5;
  return 1.0;
}

/**
 * Pure — given the answered questions in order, return the per-question
 * combo multiplier applied at the moment that question was answered.
 * The streak is the count of consecutive correct answers ending at the
 * question (not counting future questions).
 */
export function streakAtEachAnswer(
  questions: ReadonlyArray<PersonaSpeedQuestion>,
  answers: Readonly<Record<string, string>>,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  let streak = 0;
  for (const q of questions) {
    const picked = answers[q.id];
    if (!picked) {
      // Not answered yet; streak unchanged.
      continue;
    }
    if (picked === q.correctId) {
      streak += 1;
    } else {
      streak = 0;
    }
    result[q.id] = streak;
  }
  return result;
}

/** Pure — compute the max streak reached in the round. */
export function maxStreak(
  questions: ReadonlyArray<PersonaSpeedQuestion>,
  answers: Readonly<Record<string, string>>,
): number {
  let best = 0;
  let current = 0;
  for (const q of questions) {
    const picked = answers[q.id];
    if (!picked) continue;
    if (picked === q.correctId) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}
