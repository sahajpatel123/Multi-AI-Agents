/** Status filter for Agent research history (live weekly updates vs one-off). */

export type AgentHistoryStatusFilter = 'all' | 'live' | 'completed';

export const AGENT_HISTORY_STATUS_OPTIONS: Array<{
  value: AgentHistoryStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'completed', label: 'One-off' },
];

export function agentHistoryStatusLabel(filter: AgentHistoryStatusFilter): string {
  return AGENT_HISTORY_STATUS_OPTIONS.find((o) => o.value === filter)?.label || 'All';
}

export type AgentHistoryStatusItem = {
  isLive?: boolean | null;
};

/**
 * Filter history items by live weekly-update status.
 * Does not mutate the input array.
 */
export function filterAgentHistoryByStatus<T extends AgentHistoryStatusItem>(
  items: T[],
  filter: AgentHistoryStatusFilter,
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  if (filter === 'live') return list.filter((item) => !!item.isLive);
  return list.filter((item) => !item.isLive);
}
