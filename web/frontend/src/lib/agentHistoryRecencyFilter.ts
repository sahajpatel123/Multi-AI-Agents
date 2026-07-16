/** Recency filter for Agent research history. */

export type AgentHistoryRecencyFilter =
  | 'all'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'older';

export const AGENT_HISTORY_RECENCY_OPTIONS: Array<{
  value: AgentHistoryRecencyFilter;
  label: string;
}> = [
  { value: 'all', label: 'All time' },
  { value: 'last_24h', label: 'Last 24h' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'older', label: 'Older' },
];

export function agentHistoryRecencyLabel(filter: AgentHistoryRecencyFilter): string {
  return AGENT_HISTORY_RECENCY_OPTIONS.find((o) => o.value === filter)?.label || 'All time';
}

export type AgentHistoryRecencyItem = {
  created_at?: string | null;
};

function recencyMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Filter history by recency band. Does not mutate the input.
 * Bands: last 24h ≤1d, last 7d ≤7d, last 30d ≤30d, older >30d, undated = kept only by 'all'.
 */
export function filterAgentHistoryByRecency<T extends AgentHistoryRecencyItem>(
  items: T[],
  filter: AgentHistoryRecencyFilter,
  now: number = Date.now(),
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  return list.filter((item) => {
    const ms = recencyMs(item.created_at);
    if (ms == null) return false;
    const age = now - ms;
    if (filter === 'last_24h') return age >= 0 && age <= DAY_MS;
    if (filter === 'last_7d') return age >= 0 && age <= 7 * DAY_MS;
    if (filter === 'last_30d') return age >= 0 && age <= 30 * DAY_MS;
    // 'older': anything strictly older than 30d (undated already handled above)
    return age > 30 * DAY_MS;
  });
}

/** True when recency chips add value (at least one dated item). */
export function agentHistoryRecencyFilterUseful(items: AgentHistoryRecencyItem[]): boolean {
  return (items || []).some((item) => recencyMs(item.created_at) != null);
}
