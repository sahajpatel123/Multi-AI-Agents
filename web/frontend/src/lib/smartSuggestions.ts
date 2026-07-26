/**
 * SmartSuggestions — derive personalized tool recommendations from
 * the user's favorites + recent visits. Pure helpers; the widget
 * lives at components/SmartSuggestions.tsx and is mounted on the
 * hub. Mirrors the recentTools / favorites / moodHistory pattern
 * in keeping logic out of React.
 *
 * Algorithm:
 *   1. Tally how many favorites + recent visits each category has.
 *   2. Rank categories by that tally (descending).
 *   3. For the top-1 (or top-2) ranked category, find tools that
 *      are NOT yet in the user's set AND have the highest
 *      "untried-ness" score (sort by ascending visit count).
 *   4. Cap the result at `suggestionCount` (default 2).
 *
 * Cold start (no favorites, no recent) returns [] — the widget
 * renders nothing in that case so first-time visitors don't see
 * a meaningless empty rec list.
 */

import {
  PERSONA_PLAYGROUND_ENTRIES,
  type PersonaPlaygroundCategory,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';
import { readFavoriteEntries } from './favorites';
import { readRecentTools } from './recentTools';

export interface SmartSuggestion {
  readonly entry: PersonaPlaygroundEntry;
  /** Category the suggestion was derived from. */
  readonly category: PersonaPlaygroundCategory;
  /** Number of the user's favorites + recent visits in this category. */
  readonly affinity: number;
}

export interface SuggestSmartOptions {
  /** Maximum number of suggestions to return. Default 2. */
  limit?: number;
}

function uniquePaths(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v === 'string') out.add(v);
  }
  return out;
}

function rankCategories(
  favorites: readonly string[],
  recent: readonly string[],
): ReadonlyArray<{ category: PersonaPlaygroundCategory; score: number }> {
  const byPath = new Map(
    PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e.category] as const),
  );
  const counts = new Map<PersonaPlaygroundCategory, number>();
  for (const path of favorites) {
    const cat = byPath.get(path);
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 2); // favorites weigh more
  }
  for (const path of recent) {
    const cat = byPath.get(path);
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score);
}

export function suggestTools(
  storage: Pick<Storage, 'getItem'> | null,
  options: SuggestSmartOptions = {},
): readonly SmartSuggestion[] {
  const limit = options.limit ?? 2;
  if (!storage) return [];
  const favorites = Array.from(
    uniquePaths(readFavoriteEntries(storage).map((f) => f.path)),
  );
  const recent = Array.from(
    uniquePaths(readRecentTools(storage).map((r) => r.path)),
  );
  if (favorites.length === 0 && recent.length === 0) return [];

  const seen = uniquePaths([...favorites, ...recent]);
  const ranked = rankCategories(favorites, recent);
  if (ranked.length === 0) return [];

  // Take the top 1 category by default (so the suggestions share a theme).
  const topCategory = ranked[0];
  if (!topCategory) return [];

  const candidates = PERSONA_PLAYGROUND_ENTRIES.filter(
    (entry) =>
      entry.category === topCategory.category && !seen.has(entry.path),
  ).slice(0, limit);

  return candidates.map((entry) => ({
    entry,
    category: topCategory.category,
    affinity: topCategory.score,
  }));
}