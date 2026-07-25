import { describe, expect, it } from 'vitest';
import {
  DAILY_STREAK_KEY,
  DAILY_STREAK_VERSION,
  buildShareStreakText,
  clearDailyStreak,
  milestoneFor,
  readDailyStreak,
  recordDailyStreak,
  STREAK_MILESTONES,
  writeDailyStreak,
} from './dailyStreak';

function makeMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

const EMPTY = { v: DAILY_STREAK_VERSION, lastVisit: '', current: 0, longest: 0 };

describe('readDailyStreak', () => {
  it('returns initial empty state for empty storage', () => {
    expect(readDailyStreak(makeMemoryStorage())).toEqual(EMPTY);
  });

  it('returns initial empty state for null storage', () => {
    expect(readDailyStreak(null)).toEqual(EMPTY);
  });

  it('returns initial empty state for malformed JSON', () => {
    expect(readDailyStreak(makeMemoryStorage({ [DAILY_STREAK_KEY]: 'not-json' }))).toEqual(EMPTY);
  });

  it('returns initial empty state for wrong version', () => {
    const storage = makeMemoryStorage({
      [DAILY_STREAK_KEY]: JSON.stringify({ v: 99, lastVisit: '2026-07-25', current: 5, longest: 10 }),
    });
    expect(readDailyStreak(storage)).toEqual(EMPTY);
  });

  it('returns initial empty state for non-numeric counters', () => {
    const storage = makeMemoryStorage({
      [DAILY_STREAK_KEY]: JSON.stringify({ v: 1, lastVisit: '2026-07-25', current: 'oops', longest: 10 }),
    });
    expect(readDailyStreak(storage)).toEqual(EMPTY);
  });
});

describe('recordDailyStreak', () => {
  it('first visit ever starts the streak at 1', () => {
    const storage = makeMemoryStorage();
    const result = recordDailyStreak(storage, '2026-07-25');
    expect(result).toEqual({ v: 1, lastVisit: '2026-07-25', current: 1, longest: 1 });
  });

  it('re-recording the same day is a no-op', () => {
    const storage = makeMemoryStorage();
    recordDailyStreak(storage, '2026-07-25');
    const result = recordDailyStreak(storage, '2026-07-25');
    expect(result.current).toBe(1);
    expect(result.lastVisit).toBe('2026-07-25');
  });

  it('consecutive day increments the streak', () => {
    const storage = makeMemoryStorage();
    recordDailyStreak(storage, '2026-07-25');
    const result = recordDailyStreak(storage, '2026-07-26');
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });

  it('three consecutive days, longest tracks max', () => {
    const storage = makeMemoryStorage();
    recordDailyStreak(storage, '2026-07-25');
    recordDailyStreak(storage, '2026-07-26');
    recordDailyStreak(storage, '2026-07-27');
    const result = recordDailyStreak(storage, '2026-07-28');
    expect(result.current).toBe(4);
    expect(result.longest).toBe(4);
  });

  it('gap of 2+ days resets current but preserves longest', () => {
    const storage = makeMemoryStorage();
    recordDailyStreak(storage, '2026-07-25');
    recordDailyStreak(storage, '2026-07-26');
    recordDailyStreak(storage, '2026-07-27');
    // gap to 2026-07-29 (skipped 28)
    const result = recordDailyStreak(storage, '2026-07-29');
    expect(result.current).toBe(1);
    expect(result.longest).toBe(3);
  });

  it('writing invalid schema does not break the next record', () => {
    const storage = makeMemoryStorage({
      [DAILY_STREAK_KEY]: JSON.stringify({ v: 99, lastVisit: 'x', current: 5, longest: 5 }),
    });
    const result = recordDailyStreak(storage, '2026-07-25');
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });
});

describe('writeDailyStreak', () => {
  it('persists state', () => {
    const storage = makeMemoryStorage();
    writeDailyStreak(storage, { v: 1, lastVisit: '2026-07-25', current: 1, longest: 1 });
    expect(readDailyStreak(storage)).toEqual({
      v: 1,
      lastVisit: '2026-07-25',
      current: 1,
      longest: 1,
    });
  });

  it('is a no-op when storage is null', () => {
    expect(() => writeDailyStreak(null, EMPTY)).not.toThrow();
  });
});

describe('clearDailyStreak', () => {
  it('removes the storage key', () => {
    const storage = makeMemoryStorage({
      [DAILY_STREAK_KEY]: JSON.stringify({ v: 1, lastVisit: 'x', current: 5, longest: 5 }),
    });
    clearDailyStreak(storage);
    expect(storage.getItem(DAILY_STREAK_KEY)).toBeNull();
  });

  it('is a no-op when storage is null', () => {
    expect(() => clearDailyStreak(null)).not.toThrow();
  });
});

describe('milestoneFor', () => {
  it('returns null for streaks below the first threshold', () => {
    expect(milestoneFor(0)).toBeNull();
    expect(milestoneFor(1)).toBeNull();
    expect(milestoneFor(2)).toBeNull();
  });

  it('returns the lowest tier for streaks at the first threshold', () => {
    expect(milestoneFor(3)).toEqual({ days: 3, name: 'Curious', glyph: '✦' });
  });

  it('returns the highest reached tier for streaks past a threshold', () => {
    expect(milestoneFor(7)?.name).toBe('Committed');
    expect(milestoneFor(14)?.name).toBe('Devoted');
    expect(milestoneFor(30)?.name).toBe('Expert');
    expect(milestoneFor(100)?.name).toBe('Legend');
    expect(milestoneFor(250)?.name).toBe('Legend');
  });

  it('handles boundary days (one below a threshold)', () => {
    expect(milestoneFor(6)?.name).toBe('Curious');
    expect(milestoneFor(13)?.name).toBe('Committed');
    expect(milestoneFor(29)?.name).toBe('Devoted');
    expect(milestoneFor(99)?.name).toBe('Expert');
  });
});

describe('STREAK_MILESTONES', () => {
  it('thresholds are in ascending order', () => {
    const days = STREAK_MILESTONES.map((m) => m.days);
    const sorted = [...days].sort((a, b) => a - b);
    expect(days).toEqual(sorted);
  });

  it('every tier has a non-empty name and glyph', () => {
    for (const m of STREAK_MILESTONES) {
      expect(m.name).not.toEqual('');
      expect(m.glyph).not.toEqual('');
    }
  });
});

describe('buildShareStreakText', () => {
  const EMPTY = { v: 1, lastVisit: '', current: 0, longest: 0 };

  it('returns null for an empty streak', () => {
    expect(buildShareStreakText(EMPTY)).toBeNull();
  });

  it('interpolates the day count and origin', () => {
    const result = buildShareStreakText(
      { v: 1, lastVisit: '2026-07-25', current: 1, longest: 1 },
      'https://arena.example',
    );
    expect(result).toBe(
      '1-day streak on Arena Playground. Can you keep up? https://arena.example/persona-playground',
    );
  });

  it('includes the milestone glyph when reached', () => {
    const result = buildShareStreakText(
      { v: 1, lastVisit: '2026-07-25', current: 7, longest: 7 },
      'https://arena.example',
    );
    expect(result?.startsWith('✺ 7-')).toBe(true);
  });

  it('uses plural "days" for streaks > 1', () => {
    const result = buildShareStreakText(
      { v: 1, lastVisit: '2026-07-25', current: 5, longest: 5 },
      'https://arena.example',
    );
    expect(result).toContain('5-days');
  });

  it('interpolates the milestone name when reached', () => {
    const result = buildShareStreakText(
      { v: 1, lastVisit: '2026-07-25', current: 7, longest: 7 },
      'https://arena.example',
    );
    expect(result).toContain('(Committed)');
  });

  it('omits the milestone tag when below the first threshold', () => {
    const result = buildShareStreakText(
      { v: 1, lastVisit: '2026-07-25', current: 2, longest: 2 },
      'https://arena.example',
    );
    expect(result).not.toContain('(');
  });

  it('trims a trailing slash on the origin', () => {
    const result = buildShareStreakText(
      { v: 1, lastVisit: '2026-07-25', current: 1, longest: 1 },
      'https://arena.example/',
    );
    expect(result).toContain('https://arena.example/persona-playground');
  });
});
