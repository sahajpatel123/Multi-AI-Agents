/**
 * Recent shuffles — localStorage-backed history of persona-tool
 * pages the user landed on via the RandomToolButton, Shift+R
 * shortcut, or the Reshuffle button. Different from `recentTools`
 * (which records every persona-tool visit) — this list only
 * captures tools the user discovered *via the random picker*,
 * so the chip strip can answer "what did the shuffle turn up
 * lately?" without re-showing tools the user navigated to
 * manually.
 *
 * Mirrors the recentTools pattern: versioned schema, safe JSON
 * parse, normalization, dedupe, bounded list, same-tab notify.
 *
 * The tracking surface is the catalog. We never store a tool path
 * that doesn't appear in PERSONA_PLAYGROUND_ENTRIES so the widget
 * can render names without a separate lookup.
 */

import { PERSONA_PATH_PREFIX } from '../data/personaPlayground';

const STORAGE_KEY = 'arena:persona-playground:recent-shuffles:v1';
const MAX_ITEMS = 5;

/**
 * Notify same-tab listeners that the recent-shuffles list changed.
 * The browser `StorageEvent` only fires in OTHER tabs, so without
 * this signal widgets mounted in the same tab would not refresh
 * until the next page load. Swallows any dispatch failure (jsdom
 * quirks, locked-down iframes).
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

export interface RecentShuffle {
  /** Catalog path, e.g. /persona-battle. */
  readonly path: string;
  /** Last-shuffled timestamp (ms since epoch). */
  readonly at: number;
}

function normalize(path: string): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith(PERSONA_PATH_PREFIX)) return null;
  return path;
}

export function readRecentShuffles(
  storage: Pick<Storage, 'getItem'> | null,
): readonly RecentShuffle[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: RecentShuffle[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { path?: unknown; at?: unknown };
      const path = normalize(typeof o.path === 'string' ? o.path : '');
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
      out.push({ path, at });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeRecentShuffles(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly RecentShuffle[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent (quota / private mode) */
    return;
  }
  notifySameTab();
}

export function recordRecentShuffle(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  path: string,
  now: number = Date.now(),
): void {
  const normalized = normalize(path);
  if (!normalized) return;
  const existing = readRecentShuffles(storage);
  const filtered = existing.filter((e) => e.path !== normalized);
  const next: RecentShuffle[] = [{ path: normalized, at: now }, ...filtered].slice(0, MAX_ITEMS);
  writeRecentShuffles(storage, next);
}

export function clearRecentShuffles(
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

export const RECENT_SHUFFLES_KEY = STORAGE_KEY;
export const RECENT_SHUFFLES_LIMIT = MAX_ITEMS;
