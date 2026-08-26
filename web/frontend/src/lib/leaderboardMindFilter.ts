/**
 * Filter session leaderboard prompts by winning mind.
 *
 * Clicking a ranking row narrows "Session prompts" to turns that mind won.
 */

export const LEADERBOARD_MIND_ALL = 'all' as const;

export type LeaderboardMindFilter = typeof LEADERBOARD_MIND_ALL | string;

export type LeaderboardMindTurn = {
  winnerId?: string | null;
};

export type LeaderboardSearchTurn = LeaderboardMindTurn & {
  prompt?: string | null;
  winnerName?: string | null;
  oneLiner?: string | null;
  fullTake?: string | null;
};

/** Normalize user-entered search text without changing the source content. */
function normalizeLeaderboardSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filter turns by winner id. Does not mutate the input. */
export function filterLeaderboardTurnsByMind<T extends LeaderboardMindTurn>(
  turns: T[],
  mindId: LeaderboardMindFilter,
): T[] {
  const list = turns || [];
  if (!mindId || mindId === LEADERBOARD_MIND_ALL) return [...list];
  return list.filter((t) => (t.winnerId || '') === mindId);
}

/**
 * Search session prompts without mutating the source list. Every search term
 * must match somewhere in the prompt, winning mind, or answer text, so a
 * query like "launch analyst" can find a prompt and its winner together.
 */
export function filterLeaderboardTurnsByQuery<T extends LeaderboardSearchTurn>(
  turns: T[],
  query: string,
): T[] {
  const list = turns || [];
  const terms = normalizeLeaderboardSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [...list];

  return list.filter((turn) => {
    const haystack = [
      turn.prompt,
      turn.winnerName,
      turn.oneLiner,
      turn.fullTake,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const normalizedHaystack = normalizeLeaderboardSearchText(haystack);
    return terms.every((term) => normalizedHaystack.includes(term));
  });
}

export function leaderboardMindFilterLabel(
  mindId: LeaderboardMindFilter,
  resolveName?: (id: string) => string | null | undefined,
): string {
  if (!mindId || mindId === LEADERBOARD_MIND_ALL) return 'All minds';
  const name = (resolveName?.(mindId) || '').trim();
  return name || mindId;
}

/** True when at least two distinct winners appear (filter is useful). */
export function leaderboardMindFilterUseful(turns: LeaderboardMindTurn[]): boolean {
  const ids = new Set<string>();
  for (const t of turns || []) {
    const id = (t.winnerId || '').trim();
    if (id) ids.add(id);
    if (ids.size >= 2) return true;
  }
  return false;
}

/** Clipboard text for a single session prompt row. */
export function formatLeaderboardPromptCopy(opts: {
  prompt?: string | null;
  winnerName?: string | null;
  oneLiner?: string | null;
  fullTake?: string | null;
}): string {
  const prompt = (opts.prompt || '').trim() || '(no prompt)';
  const winner = (opts.winnerName || '').trim();
  const take = (opts.fullTake || opts.oneLiner || '').trim();
  const lines = [`# ${prompt}`, ''];
  if (winner) {
    lines.push(`**Winner:** ${winner}`);
    lines.push('');
  }
  if (take) {
    lines.push(take);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
