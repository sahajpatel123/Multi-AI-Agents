import { describe, expect, it } from 'vitest';
import {
  FAVORITES_KEY,
  FAVORITES_LIMIT,
  clearFavorites,
  isFavorited,
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
