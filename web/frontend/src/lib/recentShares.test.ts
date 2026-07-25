import { describe, expect, it } from 'vitest';
import {
  RECENT_SHARES_KEY,
  RECENT_SHARES_LIMIT,
  clearRecentShares,
  readRecentShares,
  recordRecentShare,
  writeRecentShares,
  type RecentShare,
} from './recentShares';

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

describe('readRecentShares', () => {
  it('returns [] for empty storage', () => {
    expect(readRecentShares(makeMemoryStorage())).toEqual([]);
  });

  it('returns [] for null storage', () => {
    expect(readRecentShares(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(readRecentShares(makeMemoryStorage({ [RECENT_SHARES_KEY]: 'not-json' }))).toEqual([]);
  });

  it('skips entries with invalid kind or label', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHARES_KEY]: JSON.stringify([
        { kind: 'compare', label: 'Council vs Mosaic', at: 1 },
        { kind: 'banana', label: 'X', at: 2 },
        { kind: 'compare', label: '', at: 3 },
        { kind: 'streak', label: '7-day', at: 4 },
      ]),
    });
    const result = readRecentShares(storage);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Council vs Mosaic');
    expect(result[1].label).toBe('7-day');
  });

  it('dedupes by url (compare + streak shares)', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHARES_KEY]: JSON.stringify([
        { kind: 'compare', label: 'A vs B', url: 'https://x/a-b', at: 2 },
        { kind: 'compare', label: 'A vs B', url: 'https://x/a-b', at: 1 },
      ]),
    });
    expect(readRecentShares(storage)).toHaveLength(1);
  });

  it('dedupes by label for url-less shares', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHARES_KEY]: JSON.stringify([
        { kind: 'streak', label: '7-day', at: 2 },
        { kind: 'streak', label: '7-day', at: 1 },
      ]),
    });
    expect(readRecentShares(storage)).toHaveLength(1);
  });

  it('respects the limit cap', () => {
    const items: RecentShare[] = Array.from({ length: 20 }, (_, i) => ({
      kind: 'other' as const,
      label: `share-${i}`,
      at: i,
    }));
    const storage = makeMemoryStorage({ [RECENT_SHARES_KEY]: JSON.stringify(items) });
    expect(readRecentShares(storage).length).toBeLessThanOrEqual(RECENT_SHARES_LIMIT);
  });
});

describe('writeRecentShares', () => {
  it('serializes the list to JSON', () => {
    const storage = makeMemoryStorage();
    writeRecentShares(storage, [{ kind: 'compare', label: 'A vs B', url: 'x', at: 1 }]);
    const raw = storage.getItem(RECENT_SHARES_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('truncates the list to the limit', () => {
    const storage = makeMemoryStorage();
    const items: RecentShare[] = Array.from({ length: 20 }, (_, i) => ({
      kind: 'other' as const,
      label: `share-${i}`,
      at: i,
    }));
    writeRecentShares(storage, items);
    const raw = storage.getItem(RECENT_SHARES_KEY);
    expect(JSON.parse(raw as string)).toHaveLength(RECENT_SHARES_LIMIT);
  });

  it('is a no-op when storage is null', () => {
    expect(() => writeRecentShares(null, [])).not.toThrow();
  });
});

describe('recordRecentShare', () => {
  it('inserts a new share at the head', () => {
    const storage = makeMemoryStorage();
    recordRecentShare(storage, { kind: 'compare', label: 'A vs B', url: 'x' }, 100);
    const result = readRecentShares(storage);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('A vs B');
    expect(result[0].at).toBe(100);
  });

  it('dedupes when re-recording the same url (moves to head)', () => {
    const storage = makeMemoryStorage();
    recordRecentShare(storage, { kind: 'compare', label: 'A vs B', url: 'x' }, 1);
    recordRecentShare(storage, { kind: 'streak', label: '7-day' }, 2);
    recordRecentShare(storage, { kind: 'compare', label: 'A vs B', url: 'x' }, 3);
    const result = readRecentShares(storage);
    expect(result).toHaveLength(2);
    expect(result[0].at).toBe(3);
  });
});

describe('clearRecentShares', () => {
  it('removes the storage key', () => {
    const storage = makeMemoryStorage({
      [RECENT_SHARES_KEY]: JSON.stringify([{ kind: 'compare', label: 'A vs B', at: 1 }]),
    });
    clearRecentShares(storage);
    expect(storage.getItem(RECENT_SHARES_KEY)).toBeNull();
  });

  it('is a no-op when storage is null', () => {
    expect(() => clearRecentShares(null)).not.toThrow();
  });
});
