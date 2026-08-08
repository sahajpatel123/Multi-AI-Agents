import { describe, expect, it, vi } from 'vitest';
import {
  FEATURED_ARCHIVE_KEY,
  FEATURED_ARCHIVE_LIMIT,
  clearFeaturedArchive,
  readFeaturedArchive,
  recordFeaturedPick,
  writeFeaturedArchive,
  type FeaturedArchiveEntry,
} from './featuredArchive';

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

describe('readFeaturedArchive', () => {
  it('returns [] for empty storage', () => {
    expect(readFeaturedArchive(makeMemoryStorage())).toEqual([]);
  });

  it('returns [] for null storage', () => {
    expect(readFeaturedArchive(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(readFeaturedArchive(makeMemoryStorage({ [FEATURED_ARCHIVE_KEY]: 'not-json' }))).toEqual([]);
  });

  it('skips entries with invalid paths or dates', () => {
    const storage = makeMemoryStorage({
      [FEATURED_ARCHIVE_KEY]: JSON.stringify([
        { path: '/persona-council', date: '2026-07-25' },
        { path: 'http://evil', date: '2026-07-24' },
        { path: '/persona-battle', date: 'not-a-date' },
        { path: '/persona-match', date: '' },
      ]),
    });
    const result = readFeaturedArchive(storage);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/persona-council');
  });

  it('dedupes by date, keeping the first occurrence', () => {
    const storage = makeMemoryStorage({
      [FEATURED_ARCHIVE_KEY]: JSON.stringify([
        { path: '/persona-battle', date: '2026-07-25' },
        { path: '/persona-council', date: '2026-07-25' },
      ]),
    });
    const result = readFeaturedArchive(storage);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/persona-battle');
  });

  it('respects the limit cap', () => {
    const items: FeaturedArchiveEntry[] = Array.from({ length: 20 }, (_, i) => ({
      path: `/persona-council-${i}`,
      date: `2026-07-${String((i % 30) + 1).padStart(2, '0')}`,
    }));
    const storage = makeMemoryStorage({ [FEATURED_ARCHIVE_KEY]: JSON.stringify(items) });
    expect(readFeaturedArchive(storage).length).toBeLessThanOrEqual(FEATURED_ARCHIVE_LIMIT);
  });
});

describe('writeFeaturedArchive', () => {
  it('serializes the list to JSON', () => {
    const storage = makeMemoryStorage();
    writeFeaturedArchive(storage, [{ path: '/persona-battle', date: '2026-07-25' }]);
    const raw = storage.getItem(FEATURED_ARCHIVE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('truncates the list to the limit', () => {
    const storage = makeMemoryStorage();
    const items: FeaturedArchiveEntry[] = Array.from({ length: 20 }, (_, i) => ({
      path: `/persona-council-${i}`,
      date: `2026-07-${String((i % 30) + 1).padStart(2, '0')}`,
    }));
    writeFeaturedArchive(storage, items);
    const raw = storage.getItem(FEATURED_ARCHIVE_KEY);
    expect(JSON.parse(raw as string)).toHaveLength(FEATURED_ARCHIVE_LIMIT);
  });

  it('is a no-op when storage is null', () => {
    expect(() => writeFeaturedArchive(null, [])).not.toThrow();
  });
});

describe('recordFeaturedPick', () => {
  it('inserts a new entry at the head', () => {
    const storage = makeMemoryStorage();
    recordFeaturedPick(storage, '/persona-battle', '2026-07-25');
    const result = readFeaturedArchive(storage);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/persona-battle');
    expect(result[0].date).toBe('2026-07-25');
  });

  it('dedupes when re-recording the same date (moves to head)', () => {
    const storage = makeMemoryStorage();
    recordFeaturedPick(storage, '/persona-battle', '2026-07-25');
    recordFeaturedPick(storage, '/persona-council', '2026-07-26');
    recordFeaturedPick(storage, '/persona-mosaic', '2026-07-25');
    const result = readFeaturedArchive(storage);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('/persona-mosaic');
    expect(result[0].date).toBe('2026-07-25');
    expect(result[1].date).toBe('2026-07-26');
  });

  it('ignores invalid paths or dates', () => {
    const storage = makeMemoryStorage();
    recordFeaturedPick(storage, 'http://evil', '2026-07-25');
    recordFeaturedPick(storage, '/persona-battle', 'not-a-date');
    expect(readFeaturedArchive(storage)).toEqual([]);
  });
});

describe('clearFeaturedArchive', () => {
  it('removes the storage key', () => {
    const storage = makeMemoryStorage({
      [FEATURED_ARCHIVE_KEY]: JSON.stringify([{ path: '/x', date: '2026-07-25' }]),
    });
    clearFeaturedArchive(storage);
    expect(storage.getItem(FEATURED_ARCHIVE_KEY)).toBeNull();
  });

  it('is a no-op when storage is null', () => {
    expect(() => clearFeaturedArchive(null)).not.toThrow();
  });
});

describe('featuredArchive same-tab storage notification', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('dispatches a synthetic storage event on recordFeaturedPick', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      recordFeaturedPick(window.localStorage, '/persona-battle', '2026-07-25');
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(FEATURED_ARCHIVE_KEY);
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on clearFeaturedArchive', () => {
    window.localStorage.setItem(
      FEATURED_ARCHIVE_KEY,
      JSON.stringify([{ path: '/x', date: '2026-07-25' }]),
    );
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearFeaturedArchive(window.localStorage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(FEATURED_ARCHIVE_KEY);
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('does not notify when storage is null', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      writeFeaturedArchive(null, []);
      clearFeaturedArchive(null);
      expect(onStorage).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});
