import { describe, expect, it, vi } from 'vitest';
import {
  FAVORITES_KEY,
  FAVORITES_LIMIT,
  clearFavorites,
  isFavorited,
  readFavoriteEntries,
  readFavorites,
  toggleFavorite,
  writeFavorites,
} from './favorites';

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

describe('readFavorites', () => {
  it('returns [] for empty storage', () => {
    expect(readFavorites(makeMemoryStorage())).toEqual([]);
  });

  it('returns [] for null storage', () => {
    expect(readFavorites(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(readFavorites(makeMemoryStorage({ [FAVORITES_KEY]: 'not-json' }))).toEqual([]);
  });

  it('skips invalid paths and dedupes', () => {
    const storage = makeMemoryStorage({
      [FAVORITES_KEY]: JSON.stringify([
        '/persona-battle',
        'http://evil',
        '/persona-council',
        '/persona-battle',
        '',
      ]),
    });
    const result = readFavorites(storage);
    expect(result).toEqual(['/persona-battle', '/persona-council']);
  });

  it('respects the limit cap', () => {
    const items = Array.from({ length: FAVORITES_LIMIT + 5 }, (_, i) => `/persona-x-${i}`);
    const storage = makeMemoryStorage({ [FAVORITES_KEY]: JSON.stringify(items) });
    expect(readFavorites(storage)).toHaveLength(FAVORITES_LIMIT);
  });
});

describe('writeFavorites', () => {
  it('serializes the list to JSON', () => {
    const storage = makeMemoryStorage();
    writeFavorites(storage, ['/persona-battle']);
    expect(storage.getItem(FAVORITES_KEY)).toBe(JSON.stringify(['/persona-battle']));
  });

  it('is a no-op when storage is null', () => {
    expect(() => writeFavorites(null, [])).not.toThrow();
  });
});

describe('isFavorited', () => {
  it('returns true when the path is favorited', () => {
    const storage = makeMemoryStorage();
    writeFavorites(storage, ['/persona-battle']);
    expect(isFavorited(storage, '/persona-battle')).toBe(true);
  });

  it('returns false when the path is not favorited', () => {
    expect(isFavorited(makeMemoryStorage(), '/persona-battle')).toBe(false);
  });

  it('returns false for invalid paths', () => {
    expect(isFavorited(makeMemoryStorage(), 'http://evil')).toBe(false);
    expect(isFavorited(makeMemoryStorage(), '')).toBe(false);
  });
});

describe('toggleFavorite', () => {
  it('adds a path on first call (returns true)', () => {
    const storage = makeMemoryStorage();
    expect(toggleFavorite(storage, '/persona-battle')).toBe(true);
    expect(readFavorites(storage)).toEqual(['/persona-battle']);
  });

  it('removes a path on second call (returns false)', () => {
    const storage = makeMemoryStorage();
    toggleFavorite(storage, '/persona-battle');
    expect(toggleFavorite(storage, '/persona-battle')).toBe(false);
    expect(readFavorites(storage)).toEqual([]);
  });

  it('prepends new paths (most recent first)', () => {
    const storage = makeMemoryStorage();
    toggleFavorite(storage, '/persona-battle');
    toggleFavorite(storage, '/persona-council');
    expect(readFavorites(storage)).toEqual(['/persona-council', '/persona-battle']);
  });

  it('ignores invalid paths', () => {
    const storage = makeMemoryStorage();
    expect(toggleFavorite(storage, 'http://evil')).toBe(false);
    expect(readFavorites(storage)).toEqual([]);
  });
});

describe('clearFavorites', () => {
  it('removes the storage key', () => {
    const storage = makeMemoryStorage({ [FAVORITES_KEY]: JSON.stringify(['/x']) });
    clearFavorites(storage);
    expect(storage.getItem(FAVORITES_KEY)).toBeNull();
  });

  it('is a no-op when storage is null', () => {
    expect(() => clearFavorites(null)).not.toThrow();
  });
});

describe('favorites same-tab storage notification', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('dispatches a synthetic storage event on toggleFavorite (add)', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      toggleFavorite(window.localStorage, '/persona-battle', 1);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(FAVORITES_KEY);
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on clearFavorites', () => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([{ path: '/x', at: 1 }]));
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearFavorites(window.localStorage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(FAVORITES_KEY);
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('does not notify when storage is null', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      writeFavorites(null, []);
      clearFavorites(null);
      expect(onStorage).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});

describe('readFavoriteEntries', () => {
  it('returns the new entry shape', () => {
    const storage = makeMemoryStorage({
      [FAVORITES_KEY]: JSON.stringify([{ path: '/persona-match', at: 100 }]),
    });
    expect(readFavoriteEntries(storage)).toEqual([{ path: '/persona-match', at: 100 }]);
  });

  it('accepts the legacy string[] format with at:0', () => {
    const storage = makeMemoryStorage({
      [FAVORITES_KEY]: JSON.stringify(['/persona-match', '/persona-battle']),
    });
    expect(readFavoriteEntries(storage)).toEqual([
      { path: '/persona-match', at: 0 },
      { path: '/persona-battle', at: 0 },
    ]);
  });

  it('dedupes paths even when mixed shape', () => {
    const storage = makeMemoryStorage({
      [FAVORITES_KEY]: JSON.stringify([
        '/persona-match',
        { path: '/persona-match', at: 100 },
        { path: '/persona-battle', at: 200 },
      ]),
    });
    const result = readFavoriteEntries(storage);
    expect(result.map((e) => e.path)).toEqual(['/persona-match', '/persona-battle']);
  });
});

describe('toggleFavorite with timestamps', () => {
  it('writes a new entry with the supplied timestamp', () => {
    const storage = makeMemoryStorage();
    expect(toggleFavorite(storage, '/persona-match', 1234)).toBe(true);
    expect(readFavoriteEntries(storage)).toEqual([{ path: '/persona-match', at: 1234 }]);
  });

  it('dedupes by path (toggling the same path twice = remove)', () => {
    const storage = makeMemoryStorage();
    toggleFavorite(storage, '/persona-match', 1);
    toggleFavorite(storage, '/persona-battle', 2);
    toggleFavorite(storage, '/persona-match', 3);
    expect(readFavoriteEntries(storage)).toEqual([{ path: '/persona-battle', at: 2 }]);
  });
});
