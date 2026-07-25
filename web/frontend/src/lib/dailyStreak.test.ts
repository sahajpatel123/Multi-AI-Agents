import { describe, expect, it } from 'vitest';
import {
  DAILY_STREAK_KEY,
  DAILY_STREAK_VERSION,
  clearDailyStreak,
  readDailyStreak,
  recordDailyStreak,
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
