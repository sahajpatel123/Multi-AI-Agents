/** Free-text filter helpers for Arena / Agent history lists (pure). */

export type SearchableTurn = {
  turn_id: string;
  prompt: string;
  /** Optional custom rename shown in the sidebar. */
  title?: string;
  prompt_category?: string;
};

/**
 * Case-insensitive match against any of the provided text fields.
 * Empty query returns all items.
 */
export function filterBySearchQuery<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => Array<string | null | undefined>,
): T[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => {
    const haystacks = fields(item);
    return haystacks.some((raw) => (raw || '').toLowerCase().includes(q));
  });
}

/**
 * Case-insensitive match against prompt and optional custom title.
 * Empty query returns all turns (caller still owns category filter).
 */
export function filterTurnsBySearchQuery<T extends SearchableTurn>(
  turns: readonly T[],
  query: string,
): T[] {
  return filterBySearchQuery(turns, query, (turn) => [turn.prompt, turn.title]);
}

export type SearchableSession = {
  session_id: string;
  title?: string | null;
  topics?: string[];
  primary_topic?: string | null;
  last_prompt?: string | null;
};

/**
 * Case-insensitive match against a resumable chat's title, last prompt,
 * primary topic, and topic list. Empty query returns all sessions.
 */
export function filterSessionsBySearchQuery<T extends SearchableSession>(
  sessions: readonly T[],
  query: string,
): T[] {
  return filterBySearchQuery(sessions, query, (session) => [
    session.title,
    session.last_prompt,
    session.primary_topic,
    ...(session.topics || []),
  ]);
}
