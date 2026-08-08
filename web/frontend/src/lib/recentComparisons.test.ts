import { describe, expect, it, vi } from 'vitest';
import {
  RECENT_COMPARISONS_KEY,
  RECENT_COMPARISONS_LIMIT,
  clearRecentComparisons,
  readRecentComparisons,
  recordRecentComparison,
  writeRecentComparisons,
  type RecentComparison,
} from './recentComparisons';

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

describe('readRecentComparisons', () => {
  it('returns [] for empty storage', () => {
    expect(readRecentComparisons(makeMemoryStorage())).toEqual([]);
  });

  it('returns [] for null storage', () => {
    expect(readRecentComparisons(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(readRecentComparisons(makeMemoryStorage({ [RECENT_COMPARISONS_KEY]: 'not-json' }))).toEqual([]);
  });

  it('returns [] for non-array JSON', () => {
    expect(
      readRecentComparisons(
        makeMemoryStorage({ [RECENT_COMPARISONS_KEY]: JSON.stringify({ foo: 'bar' }) }),
      ),
    ).toEqual([]);
  });

  it('skips entries with invalid paths', () => {
    const storage = makeMemoryStorage({
      [RECENT_COMPARISONS_KEY]: JSON.stringify([
        { a: '/persona-council', b: '/persona-mosaic-council', at: 1 },
        { a: 'http://evil', b: '/persona-council', at: 2 },
        { a: '/persona-match', b: 'also-bad', at: 3 },
        { a: '', b: '', at: 4 },
      ]),
    });
    const result = readRecentComparisons(storage);
    expect(result).toHaveLength(1);
    expect(result[0].a).toBe('/persona-council');
  });

  it('dedupes by (a, b) pair, keeping the first occurrence', () => {
    const storage = makeMemoryStorage({
      [RECENT_COMPARISONS_KEY]: JSON.stringify([
        { a: '/persona-council', b: '/persona-mosaic-council', at: 2 },
        { a: '/persona-council', b: '/persona-mosaic-council', at: 1 },
      ]),
    });
    expect(readRecentComparisons(storage)).toHaveLength(1);
  });

  it('respects the RECENT_COMPARISONS_LIMIT cap', () => {
    const items: RecentComparison[] = Array.from({ length: 20 }, (_, i) => ({
      a: `/persona-council-${i}`,
      b: `/persona-mosaic-council-${i}`,
      at: i,
    }));
    const storage = makeMemoryStorage({ [RECENT_COMPARISONS_KEY]: JSON.stringify(items) });
    expect(readRecentComparisons(storage).length).toBeLessThanOrEqual(RECENT_COMPARISONS_LIMIT);
  });
});

describe('writeRecentComparisons', () => {
  it('serializes the list to JSON', () => {
    const storage = makeMemoryStorage();
    writeRecentComparisons(storage, [{ a: '/persona-council', b: '/persona-mosaic-council', at: 1 }]);
    const raw = storage.getItem(RECENT_COMPARISONS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('truncates the list to the limit', () => {
    const storage = makeMemoryStorage();
    const items: RecentComparison[] = Array.from({ length: 20 }, (_, i) => ({
      a: `/persona-council-${i}`,
      b: `/persona-mosaic-council-${i}`,
      at: i,
    }));
    writeRecentComparisons(storage, items);
    const raw = storage.getItem(RECENT_COMPARISONS_KEY);
    expect(JSON.parse(raw as string)).toHaveLength(RECENT_COMPARISONS_LIMIT);
  });

  it('is a no-op when storage is null', () => {
    expect(() => writeRecentComparisons(null, [])).not.toThrow();
  });
});

describe('recordRecentComparison', () => {
  it('inserts a new pair at the head', () => {
    const storage = makeMemoryStorage();
    recordRecentComparison(storage, '/persona-council', '/persona-mosaic-council', 100);
    const result = readRecentComparisons(storage);
    expect(result).toHaveLength(1);
    expect(result[0].a).toBe('/persona-council');
    expect(result[0].at).toBe(100);
  });

  it('dedupes when re-recording the same pair (moves to head)', () => {
    const storage = makeMemoryStorage();
    recordRecentComparison(storage, '/persona-council', '/persona-mosaic-council', 1);
    recordRecentComparison(storage, '/persona-battle', '/persona-mosaic-battle', 2);
    recordRecentComparison(storage, '/persona-council', '/persona-mosaic-council', 3);
    const result = readRecentComparisons(storage);
    expect(result).toHaveLength(2);
    expect(result[0].a).toBe('/persona-council');
    expect(result[0].at).toBe(3);
    expect(result[1].a).toBe('/persona-battle');
  });

  it('ignores invalid paths', () => {
    const storage = makeMemoryStorage();
    recordRecentComparison(storage, 'http://evil', '/persona-council');
    recordRecentComparison(storage, '/persona-council', 'http://evil');
    expect(readRecentComparisons(storage)).toEqual([]);
  });
});

describe('clearRecentComparisons', () => {
  it('removes the storage key', () => {
    const storage = makeMemoryStorage({
      [RECENT_COMPARISONS_KEY]: JSON.stringify([{ a: '/x', b: '/y', at: 1 }]),
    });
    clearRecentComparisons(storage);
    expect(storage.getItem(RECENT_COMPARISONS_KEY)).toBeNull();
  });

  it('is a no-op when storage is null', () => {
    expect(() => clearRecentComparisons(null)).not.toThrow();
  });
});

describe('recentComparisons same-tab storage notification', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('dispatches a synthetic storage event on recordRecentComparison', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      recordRecentComparison(window.localStorage, '/persona-battle', '/persona-match', 1);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(RECENT_COMPARISONS_KEY);
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on clearRecentComparisons', () => {
    window.localStorage.setItem(
      RECENT_COMPARISONS_KEY,
      JSON.stringify([{ a: '/x', b: '/y', at: 1 }]),
    );
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearRecentComparisons(window.localStorage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(RECENT_COMPARISONS_KEY);
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('does not notify when storage is null', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      writeRecentComparisons(null, []);
      clearRecentComparisons(null);
      expect(onStorage).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});
