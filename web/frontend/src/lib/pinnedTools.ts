/**
 * PinnedTools — localStorage-backed list of persona-tool paths the
 * user explicitly pinned to the top of the hub. Distinct from
 * favorites (starred) and recentTools (visit history): pins are
 * the user's chosen shortlist, persistent, capped at 3.
 *
 * Mirrors the recentTools / favorites / moodHistory pattern:
 * versioned schema, safe JSON parse, normalization against the
 * persona path prefix, dedupe by path, bounded list, silent on
 * quota failures.
 */

import { PERSONA_PATH_PREFIX } from '../data/personaPlayground';

const STORAGE_KEY = 'arena:persona-playground:pinned-tools:v1';
const MAX_ITEMS = 3;

/**
 * Notify same-tab listeners that the pinned-tools list changed.
 * The browser `StorageEvent` only fires in OTHER tabs, so without
 * this signal the PinnedTools widget mounted in the same tab
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

function normalize(path: string): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith(PERSONA_PATH_PREFIX)) return null;
  return path;
}

export function readPinnedTools(
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
      if (typeof item !== 'string') continue;
      const path = normalize(item);
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

export function writePinnedTools(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly string[],
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
 * Toggle a path in the pin list. Returns the new pinned state
 * (true = now pinned, false = now removed). Capped at 3; adding
 * a 4th no-ops if 3 are already pinned.
 */
export function togglePinnedTool(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  path: string,
): boolean {
  const normalized = normalize(path);
  if (!normalized) return false;
  const current = readPinnedTools(storage);
  if (current.includes(normalized)) {
    writePinnedTools(storage, current.filter((p) => p !== normalized));
    return false;
  }
  if (current.length >= MAX_ITEMS) return false;
  writePinnedTools(storage, [...current, normalized]);
  return true;
}

export function isPinned(
  storage: Pick<Storage, 'getItem'> | null,
  path: string,
): boolean {
  return readPinnedTools(storage).includes(normalize(path) ?? '');
}

export function clearPinnedTools(
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

export const PINNED_TOOLS_KEY = STORAGE_KEY;
export const PINNED_TOOLS_LIMIT = MAX_ITEMS;
