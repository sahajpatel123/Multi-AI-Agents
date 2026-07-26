import { describe, expect, it, vi } from 'vitest';
import {
  RECENT_SHUFFLES_KEY,
  RECENT_SHUFFLES_LIMIT,
  clearRecentShuffles,
  readRecentShuffles,
  recordRecentShuffle,
  writeRecentShuffles,
  type RecentShuffle,
} from './recentShuffles';

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

describe('readRecentShuffles', () => {
  it('returns [] for empty storage', () => {
    expect(readRecentShuffles(makeMemoryStorage())).toEqual([]);
  });

  it('returns [] for null storage', () => {
    expect(readRecentShuffles(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(
      readRecentShuffles(makeMemoryStorage({ [RECENT_SHUFFLES_KEY]: 'not-json' })),
    ).toEqual([]);
  });

  it('skips entries with invalid paths', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHUFFLES_KEY]: JSON.stringify([
        { path: '/persona-council', at: 1 },
        { path: 'http://evil', at: 2 },
        { path: '/other-thing', at: 3 },
        { path: '', at: 4 },
      ]),
    });
    const result = readRecentShuffles(storage);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/persona-council');
  });

  it('dedupes by path, keeping the first occurrence', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHUFFLES_KEY]: JSON.stringify([
        { path: '/persona-battle', at: 2 },
        { path: '/persona-battle', at: 1 },
      ]),
    });
    expect(readRecentShuffles(storage)).toHaveLength(1);
  });

  it('respects the limit cap', () => {
    const items: RecentShuffle[] = Array.from({ length: 20 }, (_, i) => ({
      path: `/persona-council-${i}`,
      at: i,
    }));
    const storage = makeMemoryStorage({
      [RECENT_SHUFFLES_KEY]: JSON.stringify(items),
    });
    expect(readRecentShuffles(storage).length).toBeLessThanOrEqual(
      RECENT_SHUFFLES_LIMIT,
    );
  });
});

describe('writeRecentShuffles', () => {
  it('serializes the list to JSON', () => {
    const storage = makeMemoryStorage();
    writeRecentShuffles(storage, [{ path: '/persona-battle', at: 1 }]);
    const raw = storage.getItem(RECENT_SHUFFLES_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('truncates the list to the limit', () => {
    const storage = makeMemoryStorage();
    const items: RecentShuffle[] = Array.from({ length: 20 }, (_, i) => ({
      path: `/persona-council-${i}`,
      at: i,
    }));
    writeRecentShuffles(storage, items);
    const raw = storage.getItem(RECENT_SHUFFLES_KEY);
    expect(JSON.parse(raw as string)).toHaveLength(RECENT_SHUFFLES_LIMIT);
  });

  it('is a no-op when storage is null', () => {
    expect(() => writeRecentShuffles(null, [])).not.toThrow();
  });

  it('notifies same-tab listeners after a successful write', () => {
    const storage = window.localStorage;
    storage.clear();
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      writeRecentShuffles(storage, [{ path: '/persona-battle', at: 1 }]);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(RECENT_SHUFFLES_KEY);
    } finally {
      window.removeEventListener('storage', onStorage);
      storage.clear();
    }
  });

  it('does not notify when storage is null', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      writeRecentShuffles(null, []);
      expect(onStorage).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});

describe('recordRecentShuffle', () => {
  it('inserts a new shuffle at the head', () => {
    const storage = makeMemoryStorage();
    recordRecentShuffle(storage, '/persona-battle', 100);
    const result = readRecentShuffles(storage);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/persona-battle');
    expect(result[0].at).toBe(100);
  });

  it('dedupes when re-recording the same path (moves to head)', () => {
    const storage = makeMemoryStorage();
    recordRecentShuffle(storage, '/persona-battle', 1);
    recordRecentShuffle(storage, '/persona-council', 2);
    recordRecentShuffle(storage, '/persona-battle', 3);
    const result = readRecentShuffles(storage);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('/persona-battle');
    expect(result[0].at).toBe(3);
    expect(result[1].path).toBe('/persona-council');
  });

  it('ignores invalid paths', () => {
    const storage = makeMemoryStorage();
    recordRecentShuffle(storage, 'http://evil');
    expect(readRecentShuffles(storage)).toEqual([]);
  });
});

describe('clearRecentShuffles', () => {
  it('removes the storage key', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHUFFLES_KEY]: JSON.stringify([{ path: '/x', at: 1 }]),
    });
    clearRecentShuffles(storage);
    expect(storage.getItem(RECENT_SHUFFLES_KEY)).toBeNull();
  });

  it('is a no-op when storage is null', () => {
    expect(() => clearRecentShuffles(null)).not.toThrow();
  });

  it('notifies same-tab listeners after a successful clear', () => {
    const storage = window.localStorage;
    storage.setItem(RECENT_SHUFFLES_KEY, JSON.stringify([{ path: '/x', at: 1 }]));
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearRecentShuffles(storage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(RECENT_SHUFFLES_KEY);
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
      storage.clear();
    }
  });
});