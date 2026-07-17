/**
 * Case-insensitive search-term segmentation for list-row highlighting.
 * Pure helpers — safe for tests and SSR.
 */

export type SearchHighlightSegment = {
  text: string;
  match: boolean;
};

export type SplitOptions = {
  /** Case-sensitive match. Default false (case-insensitive). */
  caseSensitive?: boolean;
  /**
   * Split query on whitespace and highlight each term independently.
   * Lets "quantum computing" highlight both words. Default false
   * (whole-phrase match).
   */
  multiTerm?: boolean;
};

/**
 * Split `text` into alternating plain / match segments.
 *
 * Default: case-insensitive whole-phrase match (one contiguous needle).
 * Pass multiTerm=true to highlight every whitespace-separated term
 * independently, or caseSensitive=true to require an exact case match.
 *
 * Empty query → single plain segment. Empty text → []. Never returns
 * empty-string segments.
 */
export function splitBySearchQuery(
  text: string | null | undefined,
  query: string | null | undefined,
  options: SplitOptions = {},
): SearchHighlightSegment[] {
  const source = text ?? '';
  const rawQ = (query ?? '').trim();
  if (!source) return [];
  if (!rawQ) return [{ text: source, match: false }];

  const terms = options.multiTerm
    ? rawQ.split(/\s+/).filter((t) => t.length > 0)
    : [rawQ];
  if (terms.length === 0) return [{ text: source, match: false }];

  const haystack = options.caseSensitive ? source : source.toLowerCase();
  const needles = terms.map((t) => (options.caseSensitive ? t : t.toLowerCase()));

  // Run a single linear pass via regex alternation. Regex metachars in
  // each needle are escaped so '100%' matches the literal substring
  // (otherwise % acts as wildcard and highlights every char).
  const pattern = new RegExp(
    needles.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    options.caseSensitive ? 'g' : 'gi',
  );
  const matches: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(haystack)) !== null) {
    matches.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) pattern.lastIndex++; // defensive: zero-length loop guard
  }
  if (matches.length === 0) return [{ text: source, match: false }];

  // Merge overlapping/adjacent matches so two needles that touch each
  // other collapse to a single contiguous mark rather than producing
  // a no-plain-text gap between them.
  matches.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const last = merged[merged.length - 1];
    const cur = matches[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }

  const segments: SearchHighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: source.slice(cursor, start), match: false });
    }
    segments.push({ text: source.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), match: false });
  }
  return segments.filter((s) => s.text.length > 0);
}

/** True when highlighting would change the render (non-empty query + non-empty text). */
export function searchHighlightUseful(
  text: string | null | undefined,
  query: string | null | undefined,
  options: SplitOptions = {},
): boolean {
  const source = text ?? '';
  const rawQ = (query ?? '').trim();
  if (!source || !rawQ) return false;
  const haystack = options.caseSensitive ? source : source.toLowerCase();
  const needle = options.caseSensitive ? rawQ : rawQ.toLowerCase();
  return haystack.includes(needle);
}