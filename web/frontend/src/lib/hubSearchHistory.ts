/**
 * HubSearchHistory — localStorage-backed list of recent hub search
 * queries. Mirrors the moodHistory / pinnedTools / favorites
 * pattern: versioned schema, safe JSON parse, normalization,
 * dedupe by lowercase query (most-recent-first), bounded to 5.
 *
 * Excludes empty / whitespace-only queries so a user clearing
 * the search field doesn't pollute history. Trims + collapses
 * internal whitespace before storing.
 */

const STORAGE_KEY = 'arena:persona-playground:search-history:v1';
const MAX_ITEMS = 5;

/**
 * Notify same-tab listeners that the search history changed.
 * The browser `StorageEvent` only fires in OTHER tabs, so without
 * this signal the HubSearchHistory widget mounted in the same tab
 * would not refresh until the next page load. Swallows any
 * dispatch failure (jsdom quirks, locked-down iframes).
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

export interface SearchHistoryEntry {
  /** Normalized query string (trimmed, collapsed whitespace). */
  readonly query: string;
  /** Last-searched timestamp (ms since epoch). */
  readonly at: number;
}

function normalize(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed;
}

function sameKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function readSearchHistory(
  storage: Pick<Storage, 'getItem'> | null,
): readonly SearchHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: SearchHistoryEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { query?: unknown; at?: unknown };
      const query = normalize(typeof o.query === 'string' ? o.query : '');
      if (!query || seen.has(query.toLowerCase())) continue;
      seen.add(query.toLowerCase());
      const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
      out.push({ query, at });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeSearchHistory(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly SearchHistoryEntry[],
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

/**
 * Record a search. Empty / whitespace-only queries are dropped.
 * Returns the new full list (most-recent-first, deduped).
 */
export function recordSearch(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  query: string,
  now: number = Date.now(),
): readonly SearchHistoryEntry[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const current = readSearchHistory(storage);
  const filtered = current.filter((e) => !sameKey(e.query, normalized));
  const next: SearchHistoryEntry[] = [
    { query: normalized, at: now },
    ...filtered,
  ].slice(0, MAX_ITEMS);
  writeSearchHistory(storage, next);
  return next;
}

export function clearSearchHistory(
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

export const SEARCH_HISTORY_KEY = STORAGE_KEY;
export const SEARCH_HISTORY_LIMIT = MAX_ITEMS;