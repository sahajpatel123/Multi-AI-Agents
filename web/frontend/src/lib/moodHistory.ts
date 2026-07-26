/**
 * MoodMatcherHistory — localStorage-backed list of recently
 * picked moods. Mirrors the recentTools / favorites pattern:
 * versioned schema, safe JSON parse, normalization against the
 * known mood ids, dedupe by id (most-recent-first), bounded list.
 *
 * The widget uses this to surface "Your recent moods" chips below
 * the active pick so users can re-jump to a recommendation without
 * re-deciding which mood fits.
 */

import { isMoodId, type MoodId } from './moodMatcher';

const STORAGE_KEY = 'arena:persona-playground:mood-history:v1';
const MAX_ITEMS = 5;

export interface MoodHistoryEntry {
  readonly id: MoodId;
  /** Last-picked timestamp (ms since epoch). 0 for legacy entries. */
  readonly at: number;
}

export function readMoodHistory(
  storage: Pick<Storage, 'getItem'> | null,
): readonly MoodHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<MoodId>();
    const out: MoodHistoryEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { id?: unknown; at?: unknown };
      if (!isMoodId(o.id)) continue;
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0;
      out.push({ id: o.id, at });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeMoodHistory(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly MoodHistoryEntry[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent (quota / private mode) */
  }
}

/**
 * Record a mood pick. Bumps existing entries to the front; returns
 * the new full list. Invalid ids are ignored.
 */
export function recordMoodPick(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  id: MoodId,
  now: number = Date.now(),
): readonly MoodHistoryEntry[] {
  if (!isMoodId(id)) return [];
  const current = readMoodHistory(storage);
  const filtered = current.filter((e) => e.id !== id);
  const next: MoodHistoryEntry[] = [{ id, at: now }, ...filtered].slice(0, MAX_ITEMS);
  writeMoodHistory(storage, next);
  return next;
}

export function clearMoodHistory(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export const MOOD_HISTORY_KEY = STORAGE_KEY;
export const MOOD_HISTORY_LIMIT = MAX_ITEMS;