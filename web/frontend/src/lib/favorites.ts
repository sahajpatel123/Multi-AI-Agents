/**
 * Favorites — localStorage-backed set of persona-tool paths the
 * user has starred. Mirrors the recentTools / recentComparisons /
 * recentShares / featuredArchive pattern: versioned schema, safe
 * JSON parse, normalization, silent on quota / private-mode
 * failures.
 *
 * Stored as a flat array of paths (deduped) rather than a map for
 * simplicity. The hub uses this to surface a "Your favorite tools"
 * widget so return visits land on the tools the user explicitly
 * claimed.
 */

const STORAGE_KEY = 'arena:persona-playground:favorites:v1';
const MAX_ITEMS = 27; // size of the catalog

function normalize(path: string): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/persona-')) return null;
  return path;
}

export function readFavorites(
  storage: Pick<Storage, 'getItem'> | null,
): readonly string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      const path = normalize(typeof item === 'string' ? item : '');
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push(path);
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeFavorites(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly string[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent */
  }
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
 * (true = now favorited, false = now removed).
 */
export function toggleFavorite(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  path: string,
): boolean {
  const normalized = normalize(path);
  if (!normalized) return false;
  const current = readFavorites(storage);
  if (current.includes(normalized)) {
    writeFavorites(storage, current.filter((p) => p !== normalized));
    return false;
  }
  writeFavorites(storage, [normalized, ...current].slice(0, MAX_ITEMS));
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
  }
}

export const FAVORITES_KEY = STORAGE_KEY;
export const FAVORITES_LIMIT = MAX_ITEMS;
