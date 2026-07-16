/**
 * Case-insensitive search-term segmentation for list-row highlighting.
 * Pure helpers — safe for tests and SSR.
 */

export type SearchHighlightSegment = {
  text: string;
  match: boolean;
};

/**
 * Split `text` into alternating plain / match segments for the first-pass
 * case-insensitive occurrences of `query`. Empty query → single plain segment.
 * Does not mutate inputs; never returns empty-string segments.
 */
export function splitBySearchQuery(
  text: string | null | undefined,
  query: string | null | undefined,
): SearchHighlightSegment[] {
  const source = text ?? '';
  const q = (query ?? '').trim();
  if (!source) return [];
  if (!q) return [{ text: source, match: false }];

  const lower = source.toLowerCase();
  const qLower = q.toLowerCase();
  // Guard against zero-length after trim (already handled) and runaway loops.
  if (!qLower.length) return [{ text: source, match: false }];

  const segments: SearchHighlightSegment[] = [];
  let i = 0;
  while (i < source.length) {
    const idx = lower.indexOf(qLower, i);
    if (idx === -1) {
      segments.push({ text: source.slice(i), match: false });
      break;
    }
    if (idx > i) {
      segments.push({ text: source.slice(i, idx), match: false });
    }
    segments.push({ text: source.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return segments.filter((s) => s.text.length > 0);
}

/** True when highlighting would change the render (non-empty query + non-empty text). */
export function searchHighlightUseful(
  text: string | null | undefined,
  query: string | null | undefined,
): boolean {
  const source = text ?? '';
  const q = (query ?? '').trim();
  if (!source || !q) return false;
  return source.toLowerCase().includes(q.toLowerCase());
}
