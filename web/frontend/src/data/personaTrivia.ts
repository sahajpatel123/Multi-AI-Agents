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

// Round history — saved every completed round so the trivia page can show
// recent attempts and let the user replay the same question set.

export interface TriviaRoundEntry {
  readonly id: string;
  readonly score: number;
  readonly total: number;
  readonly maxStreak: number;
  readonly savedAt: string;
}

const HISTORY_LIMIT = 10;
const HISTORY_KEY = 'arena:persona-trivia:history:v1';

export function readTriviaHistory(): ReadonlyArray<TriviaRoundEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TriviaRoundEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.score === 'number' &&
          typeof e.total === 'number' &&
          typeof e.maxStreak === 'number',
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function appendTriviaHistory(entry: TriviaRoundEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readTriviaHistory().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function clearTriviaHistory() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* silent */
  }
}

// Bonus scoring — faster correct answers earn more points.
// Each question is worth 100 base points; speed bonus adds 0..50 points
// based on elapsed time vs the per-question budget (default 12s).

export const DEFAULT_TIME_BUDGET_MS = 12_000;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 50;

export interface TimedAnswer {
  readonly questionId: string;
  readonly correct: boolean;
  readonly elapsedMs: number;
  readonly points: number;
}

/** Pure — compute points for one answered question. */
export function computeQuestionPoints(
  correct: boolean,
  elapsedMs: number,
  budgetMs: number = DEFAULT_TIME_BUDGET_MS,
): number {
  if (!correct) return 0;
  const clampedElapsed = Math.max(0, Math.min(elapsedMs, budgetMs));
  // Linear ramp: full budget elapsed → 0 bonus; instant answer → full bonus.
  const speedFraction = 1 - clampedElapsed / budgetMs;
  return BASE_POINTS + Math.round(speedFraction * MAX_SPEED_BONUS);
}

/** Pure — longest streak of consecutive correct answers (in question order). */
export function computeMaxStreak(
  results: ReadonlyArray<{ correct: boolean }>,
): number {
  let best = 0;
  let current = 0;
  for (const r of results) {
    if (r.correct) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}