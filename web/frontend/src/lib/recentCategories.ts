/**
 * RecentCategories — localStorage-backed list of recently used
 * persona-tool categories. Mirrors the moodHistory / pinnedTools /
 * favorites pattern: versioned schema, safe JSON parse,
 * normalization against known category ids, dedupe by id
 * (most-recent-first), bounded list.
 *
 * Distinct from "all categories" (the catalog has 7 fixed
 * categories): this records the user's actual filter behavior so
 * a quick-chips widget can re-surface their top picks without
 * forcing them to scroll the filter chip row every time.
 */

import type { PersonaPlaygroundCategory } from '../data/personaPlayground';

export type { PersonaPlaygroundCategory };

const STORAGE_KEY = 'arena:persona-playground:recent-categories:v1';
const MAX_ITEMS = 5;

const VALID_CATEGORIES = new Set<PersonaPlaygroundCategory>([
  'discover',
  'versus',
  'council',
  'roast',
  'decide',
  'forecast',
  'mosaic',
]);

export function isValidCategoryId(value: unknown): value is PersonaPlaygroundCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value as PersonaPlaygroundCategory);
}

export function readRecentCategories(
  storage: Pick<Storage, 'getItem'> | null,
): readonly PersonaPlaygroundCategory[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<PersonaPlaygroundCategory>();
    const out: PersonaPlaygroundCategory[] = [];
    for (const item of parsed) {
      if (!isValidCategoryId(item)) continue;
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeRecentCategories(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly PersonaPlaygroundCategory[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent */
  }
}

/**
 * Record a category use. Bumps existing entries to the front;
 * returns the new full list. Invalid ids are ignored.
 */
export function recordRecentCategory(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  id: PersonaPlaygroundCategory,
): readonly PersonaPlaygroundCategory[] {
  if (!isValidCategoryId(id)) return [];
  const current = readRecentCategories(storage);
  const filtered = current.filter((c) => c !== id);
  const next = [id, ...filtered].slice(0, MAX_ITEMS);
  writeRecentCategories(storage, next);
  return next;
}

export function clearRecentCategories(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export const RECENT_CATEGORIES_KEY = STORAGE_KEY;
export const RECENT_CATEGORIES_LIMIT = MAX_ITEMS;