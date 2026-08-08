/**
 * Command palette — pure helpers for filtering the persona-tool
 * catalog by free text and pinning the keyboard-selected match.
 *
 * Lives outside React so the filtering algorithm can be unit-tested
 * without a DOM, and so future surfaces (e.g. a navbar launcher) can
 * reuse the same matcher.
 *
 * Scoring is intentionally cheap — substring containment ranked by
 * where the match lands in the haystack. Name prefix hits beat
 * tagline hits beat blurb hits. Ties break by alphabetical name so
 * the same query returns the same leading entry across re-opens.
 */

import type { PersonaPlaygroundEntry } from '../data/personaPlayground';

export interface PaletteMatch {
  readonly entry: PersonaPlaygroundEntry;
  /** Lower score = better match. -Infinity means "no match". */
  readonly score: number;
}

const NAME_PREFIX = -3;
const NAME_SUBSTRING = -2;
const TAGLINE_HIT = -1;
const BLURB_HIT = 0;
const NO_MATCH = Number.POSITIVE_INFINITY;

function score(haystack: string, needle: string): number {
  if (!needle) return NO_MATCH;
  const i = haystack.indexOf(needle);
  if (i < 0) return NO_MATCH;
  return i;
}

function bestScore(parts: ReadonlyArray<[string, number]>, needle: string): number {
  let best = NO_MATCH;
  for (const [text, weight] of parts) {
    const s = score(text, needle);
    if (s === NO_MATCH) continue;
    const candidate = s + weight;
    if (candidate < best) best = candidate;
  }
  return best;
}

function compareMatches(a: PaletteMatch, b: PaletteMatch): number {
  if (a.score !== b.score) return a.score - b.score;
  return a.entry.name.localeCompare(b.entry.name);
}

/**
 * Filter the catalog against a free-text query. Empty queries return
 * the full catalog in catalog order — the palette still has to
 * surface *something* to navigate even before the user types.
 */
export function filterForPalette(
  entries: readonly PersonaPlaygroundEntry[],
  query: string,
): readonly PaletteMatch[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return entries.map((entry) => ({ entry, score: 0 }));
  }
  const out: PaletteMatch[] = [];
  for (const entry of entries) {
    const parts: ReadonlyArray<[string, number]> = [
      [entry.name.toLowerCase(), NAME_PREFIX],
      [entry.tagline.toLowerCase(), NAME_SUBSTRING],
      [entry.blurb.toLowerCase(), TAGLINE_HIT],
      [entry.format.toLowerCase(), BLURB_HIT],
    ];
    const score = bestScore(parts, trimmed);
    if (score === NO_MATCH) continue;
    // Bonus for name prefix match to ensure "per" → Persona Match.
    const nameIdx = entry.name.toLowerCase().indexOf(trimmed);
    const adjusted =
      nameIdx === 0
        ? score - 0.5
        : score;
    out.push({ entry, score: adjusted });
  }
  return out.sort(compareMatches);
}

/**
 * Move the cursor with wrap-around so `up` from the top lands on the
 * last item and `down` from the bottom lands on the first.
 */
export function clampIndex(next: number, length: number, fallback: number): number {
  if (length <= 0) return fallback;
  const wrapped = ((next % length) + length) % length;
  return wrapped;
}

/**
 * Keyboard shortcut detection — `Cmd/Ctrl + K` (or just `K`) when
 * the user is not typing in a form control. Shift is allowed so
 * Caps-Lock / shifted punctuation on some layouts doesn't break it.
 */
export function isPaletteOpenKey(event: KeyboardEvent): boolean {
  if (event.key !== 'k' && event.key !== 'K') return false;
  if (event.altKey) return false;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier) return true;
  // Bare K — only the meta/ctrl/alt keys disqualify. Shift is fine.
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}