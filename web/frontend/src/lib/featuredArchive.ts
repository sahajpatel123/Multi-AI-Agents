/**
 * Featured archive — localStorage-backed history of the persona
 * playground's daily featured picks. Mirrors the recentComparisons /
 * recentTools pattern: versioned schema, safe JSON parse, dedupe by
 * date (one pick per day), bounded list.
 *
 * The hub uses this to surface a "Past featured picks" widget so
 * users who missed yesterday's pick can see it (and the 6 before).
 */

import { PERSONA_PATH_PREFIX } from '../data/personaPlayground';

const STORAGE_KEY = 'arena:persona-playground:featured-archive:v1';
const MAX_ITEMS = 7;

export interface FeaturedArchiveEntry {
  /** Catalog path, e.g. /persona-battle. */
  readonly path: string;
  /** YYYY-MM-DD of the day the pick was featured. */
  readonly date: string;
}

function normalizePath(path: string): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith(PERSONA_PATH_PREFIX)) return null;
  return path;
}

function isValidDate(date: string): boolean {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function readFeaturedArchive(
  storage: Pick<Storage, 'getItem'> | null,
): readonly FeaturedArchiveEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: FeaturedArchiveEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { path?: unknown; date?: unknown };
      const path = normalizePath(typeof o.path === 'string' ? o.path : '');
      if (!path || !isValidDate(typeof o.date === 'string' ? o.date : '')) continue;
      if (seen.has(o.date as string)) continue;
      seen.add(o.date as string);
      out.push({ path, date: o.date as string });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeFeaturedArchive(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly FeaturedArchiveEntry[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent */
  }
}

export function recordFeaturedPick(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  path: string,
  date: string,
): void {
  const normalized = normalizePath(path);
  if (!normalized || !isValidDate(date)) return;
  const existing = readFeaturedArchive(storage);
  const filtered = existing.filter((e) => e.date !== date);
  const next: FeaturedArchiveEntry[] = [
    { path: normalized, date },
    ...filtered,
  ].slice(0, MAX_ITEMS);
  writeFeaturedArchive(storage, next);
}

export function clearFeaturedArchive(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export const FEATURED_ARCHIVE_KEY = STORAGE_KEY;
export const FEATURED_ARCHIVE_LIMIT = MAX_ITEMS;
