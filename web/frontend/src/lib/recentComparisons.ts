/**
 * Recent comparisons — localStorage-backed history of persona-tool
 * compare pairs the user has viewed. Mirrors the recentPrompts
 * pattern: versioned schema, safe JSON parse, normalization,
 * dedupe-by-pair, bounded list.
 *
 * The hub uses this to surface a "Recent comparisons" widget so
 * return visits land on the pair the user was last working with.
 */

import { PERSONA_PATH_PREFIX } from '../data/personaPlayground';

const STORAGE_KEY = 'arena:persona-playground:recent-comparisons:v1';
const MAX_ITEMS = 6;

export interface RecentComparison {
  /** First path (slot A). */
  readonly a: string;
  /** Second path (slot B). */
  readonly b: string;
  /** Last-viewed timestamp (ms since epoch). */
  readonly at: number;
}

function normalize(path: string): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith(PERSONA_PATH_PREFIX)) return null;
  return path;
}

function pairKey(a: string, b: string): string {
  return `${a}|${b}`;
}

export function readRecentComparisons(
  storage: Pick<Storage, 'getItem'> | null,
): readonly RecentComparison[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: RecentComparison[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { a?: unknown; b?: unknown; at?: unknown };
      const a = normalize(typeof o.a === 'string' ? o.a : '');
      const b = normalize(typeof o.b === 'string' ? o.b : '');
      if (!a || !b) continue;
      const key = pairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
      out.push({ a, b, at });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeRecentComparisons(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly RecentComparison[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent (quota / private mode) */
  }
}

export function recordRecentComparison(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  a: string,
  b: string,
  now: number = Date.now(),
): void {
  const aPath = normalize(a);
  const bPath = normalize(b);
  if (!aPath || !bPath) return;
  const existing = readRecentComparisons(storage);
  const key = pairKey(aPath, bPath);
  const filtered = existing.filter((e) => pairKey(e.a, e.b) !== key);
  const next: RecentComparison[] = [{ a: aPath, b: bPath, at: now }, ...filtered].slice(0, MAX_ITEMS);
  writeRecentComparisons(storage, next);
}

export function clearRecentComparisons(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export const RECENT_COMPARISONS_KEY = STORAGE_KEY;
export const RECENT_COMPARISONS_LIMIT = MAX_ITEMS;
