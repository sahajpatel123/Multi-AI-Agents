/** Winner-mind filter for Arena sidebar Recents. */

export const SIDEBAR_RECENTS_WINNER_ALL = 'all' as const;

export type SidebarRecentsWinnerFilter = typeof SIDEBAR_RECENTS_WINNER_ALL | string;

export type SidebarRecentsWinnerOption = {
  value: SidebarRecentsWinnerFilter;
  label: string;
};

export type SidebarRecentsWinnerItem = {
  winner_id?: string | null;
  winnerName?: string | null;
};

function resolveWinnerKey(item: SidebarRecentsWinnerItem): string {
  return (item.winner_id || '').trim() || 'unknown';
}

/**
 * Build All + unique winner chips from the current recents list.
 * Labels prefer winnerName, then the optional name resolver, then winner id.
 */
export function collectRecentsWinnerFilterOptions(
  items: SidebarRecentsWinnerItem[],
  resolveName?: (winnerId: string) => string | null | undefined,
): SidebarRecentsWinnerOption[] {
  const labels = new Map<string, string>();
  for (const item of items || []) {
    const key = resolveWinnerKey(item);
    if (labels.has(key)) continue;
    const fromName = (item.winnerName || '').trim();
    const fromResolver = (resolveName?.(key) || '').trim();
    labels.set(key, fromName || fromResolver || key);
  }

  const winners = [...labels.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
    );

  return [{ value: SIDEBAR_RECENTS_WINNER_ALL, label: 'All winners' }, ...winners];
}

export function sidebarRecentsWinnerFilterLabel(
  filter: SidebarRecentsWinnerFilter,
  options: SidebarRecentsWinnerOption[],
): string {
  return options.find((o) => o.value === filter)?.label || 'All winners';
}

/**
 * Filter recents by winner mind (winner_id). Does not mutate the input.
 */
export function filterRecentsByWinner<T extends SidebarRecentsWinnerItem>(
  items: T[],
  filter: SidebarRecentsWinnerFilter,
): T[] {
  const list = items || [];
  if (!filter || filter === SIDEBAR_RECENTS_WINNER_ALL) return [...list];
  return list.filter((item) => resolveWinnerKey(item) === filter);
}
