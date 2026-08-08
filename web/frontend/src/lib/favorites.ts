/**
 * Favorites — localStorage-backed set of persona-tool paths the
 * user has starred. Mirrors the recentTools / recentComparisons /
 * recentShares / featuredArchive pattern: versioned schema, safe
 * JSON parse, normalization, silent on quota / private-mode
 * failures.
 *
 * Stored as an array of `{ path, at }` entries (deduped by path,
 * most-recent-first). Backward-compatible with the old `string[]`
 * format from cycle 365 — read accepts both shapes.
 */

import { PERSONA_PATH_PREFIX } from '../data/personaPlayground';

const STORAGE_KEY = 'arena:persona-playground:favorites:v1';
const MAX_ITEMS = 27; // size of the catalog

/**
 * Notify same-tab listeners that the favorites list changed.
 * The browser `StorageEvent` only fires in OTHER tabs, so without
 * this signal widgets like `Favorites` and `RecentlyFavorited`
 * mounted in the same tab would not refresh until the next page
 * load. Swallows any dispatch failure (jsdom quirks, locked-down
 * iframes).
 */
function notifySameTab(): void {
  if (typeof window === 'undefined') return;
  try {
    const event = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: window.localStorage.getItem(STORAGE_KEY),
    });
    window.dispatchEvent(event);
  } catch {
    /* silent */
  }
}

function normalize(path: string): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith(PERSONA_PATH_PREFIX)) return null;
  return path;
}

export interface FavoriteEntry {
  readonly path: string;
  /** Last-starred timestamp (ms since epoch). 0 for legacy entries. */
  readonly at: number;
}

function isFavoriteEntry(item: unknown): item is FavoriteEntry {
  if (!item || typeof item !== 'object') return false;
  const o = item as { path?: unknown; at?: unknown };
  return typeof o.path === 'string' && (o.at === undefined || typeof o.at === 'number');
}

export function readFavorites(
  storage: Pick<Storage, 'getItem'> | null,
): readonly string[] {
  return readFavoriteEntries(storage).map((e) => e.path);
}

export function readFavoriteEntries(
  storage: Pick<Storage, 'getItem'> | null,
): readonly FavoriteEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: FavoriteEntry[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        const path = normalize(item);
        if (!path || seen.has(path)) continue;
        seen.add(path);
        out.push({ path, at: 0 });
      } else if (isFavoriteEntry(item)) {
        const path = normalize(item.path);
        if (!path || seen.has(path)) continue;
        seen.add(path);
        const at = typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : 0;
        out.push({ path, at });
      } else {
        continue;
      }
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeFavorites(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly FavoriteEntry[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent */
    return;
  }
  notifySameTab();
}

export function isFavorited(
  storage: Pick<Storage, 'getItem'> | null,
  path: string,
): boolean {
  const normalized = normalize(path);
  if (!normalized) return false;
  return readFavorites(storage).includes(normalized);
}

/**
 * Toggle a path in the favorites list. Returns the new state
 * (true = now favorited, false = now removed). Bumps the
 * `at` timestamp to now when adding; clears the entry when
 * removing.
 */
export function toggleFavorite(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  path: string,
  now: number = Date.now(),
): boolean {
  const normalized = normalize(path);
  if (!normalized) return false;
  const current = readFavoriteEntries(storage);
  if (current.some((e) => e.path === normalized)) {
    writeFavorites(
      storage,
      current.filter((e) => e.path !== normalized),
    );
    return false;
  }
  writeFavorites(
    storage,
    [{ path: normalized, at: now }, ...current].slice(0, MAX_ITEMS),
  );
  return true;
}

export function clearFavorites(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
    return;
  }
  notifySameTab();
}

export const FAVORITES_KEY = STORAGE_KEY;
export const FAVORITES_LIMIT = MAX_ITEMS;
