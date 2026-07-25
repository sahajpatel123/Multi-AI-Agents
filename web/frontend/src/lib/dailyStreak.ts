/**
 * Daily streak — localStorage-backed counter of consecutive days the
 * user has visited the persona playground. Drives the "return-visit"
 * widget on the hub. Mirrors the recentPrompts / recentComparisons
 * / recentTools pattern: versioned schema, safe JSON parse, silent
 * on quota / private-mode failures.
 *
 * Streak rules (recorded on each call to recordDailyStreak):
 *   - first visit ever:        streak = 1
 *   - last visit = today:      no-op (return value is the current state)
 *   - last visit = yesterday:  streak += 1
 *   - last visit <= 2 days ago or unknown: streak resets to 1
 *
 * "Yesterday" and "today" are computed from the local date the caller
 * passes in, so tests can drive the counter across days without
 * mutating the system clock.
 */

const STORAGE_KEY = 'arena:persona-playground:daily-streak:v1';
const STATE_VERSION = 1 as const;

export interface DailyStreakState {
  /** Schema version — bump if the shape changes. */
  readonly v: typeof STATE_VERSION;
  /** YYYY-MM-DD of the most recent visit. */
  readonly lastVisit: string;
  /** Consecutive-day count, including today if lastVisit === today. */
  readonly current: number;
  /** All-time best consecutive-day count. */
  readonly longest: number;
}

const INITIAL_STATE: DailyStreakState = {
  v: STATE_VERSION,
  lastVisit: '',
  current: 0,
  longest: 0,
};

function isYesterday(prev: string, today: string): boolean {
  if (!prev) return false;
  const prevDate = new Date(`${prev}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  if (Number.isNaN(prevDate.getTime()) || Number.isNaN(todayDate.getTime())) return false;
  const diff = todayDate.getTime() - prevDate.getTime();
  // Account for DST: between 22h and 26h counts as a single day.
  return diff >= 22 * 60 * 60 * 1000 && diff <= 26 * 60 * 60 * 1000;
}

export function readDailyStreak(
  storage: Pick<Storage, 'getItem'> | null,
): DailyStreakState {
  if (!storage) return INITIAL_STATE;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as DailyStreakState;
    if (parsed?.v !== STATE_VERSION) return INITIAL_STATE;
    if (typeof parsed.lastVisit !== 'string') return INITIAL_STATE;
    if (typeof parsed.current !== 'number' || !Number.isFinite(parsed.current)) return INITIAL_STATE;
    if (typeof parsed.longest !== 'number' || !Number.isFinite(parsed.longest)) {
      return INITIAL_STATE;
    }
    return {
      v: STATE_VERSION,
      lastVisit: parsed.lastVisit,
      current: parsed.current,
      longest: parsed.longest,
    };
  } catch {
    return INITIAL_STATE;
  }
}

export function writeDailyStreak(
  storage: Pick<Storage, 'setItem'> | null,
  state: DailyStreakState,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* silent */
  }
}

export function recordDailyStreak(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  today: string,
): DailyStreakState {
  const current = readDailyStreak(storage);
  if (current.lastVisit === today) {
    return current; // already counted today
  }
  let next: DailyStreakState;
  if (isYesterday(current.lastVisit, today)) {
    next = {
      v: STATE_VERSION,
      lastVisit: today,
      current: current.current + 1,
      longest: Math.max(current.longest, current.current + 1),
    };
  } else {
    next = {
      v: STATE_VERSION,
      lastVisit: today,
      current: 1,
      longest: Math.max(current.longest, 1),
    };
  }
  writeDailyStreak(storage, next);
  return next;
}

export function clearDailyStreak(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export const DAILY_STREAK_KEY = STORAGE_KEY;
export const DAILY_STREAK_VERSION = STATE_VERSION;

// ---------------------------------------------------------------------------
// Milestone tiers
// ---------------------------------------------------------------------------
// Names + glyphs for consecutive-day streaks. The first milestone is at
// 3 days (anything less is "just getting started") and the last is at 100
// (which is the project's horizon for "you're a fixture of the playground").
// milestoneFor(days) returns the highest tier the streak has reached.

export interface StreakMilestone {
  /** Consecutive-day threshold to reach this tier. */
  readonly days: number;
  /** Display name (e.g. "Curious", "Devoted"). */
  readonly name: string;
  /** One-character glyph for the badge. */
  readonly glyph: string;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { days: 3, name: 'Curious', glyph: '✦' },
  { days: 7, name: 'Committed', glyph: '✺' },
  { days: 14, name: 'Devoted', glyph: '✸' },
  { days: 30, name: 'Expert', glyph: '✹' },
  { days: 100, name: 'Legend', glyph: '✷' },
];

export function milestoneFor(days: number): StreakMilestone | null {
  if (days < STREAK_MILESTONES[0]?.days) return null;
  let best: StreakMilestone | null = null;
  for (const m of STREAK_MILESTONES) {
    if (days >= m.days) best = m;
  }
  return best;
}
