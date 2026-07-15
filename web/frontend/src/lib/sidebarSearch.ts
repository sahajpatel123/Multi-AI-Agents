/** Filter Arena sidebar recents by free-text query (pure). */

export type SearchableTurn = {
  turn_id: string;
  prompt: string;
  /** Optional custom rename shown in the sidebar. */
  title?: string;
  prompt_category?: string;
};

/**
 * Case-insensitive match against prompt and optional custom title.
 * Empty query returns all turns (caller still owns category filter).
 */
export function filterTurnsBySearchQuery<T extends SearchableTurn>(
  turns: readonly T[],
  query: string,
): T[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [...turns];
  return turns.filter((turn) => {
    const prompt = (turn.prompt || '').toLowerCase();
    const title = (turn.title || '').toLowerCase();
    return prompt.includes(q) || title.includes(q);
  });
}
