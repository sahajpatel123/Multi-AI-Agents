/** Source filter for Agent research history. */

export const AGENT_HISTORY_SOURCE_ALL = 'all' as const;

export type AgentHistorySourceFilter =
  | typeof AGENT_HISTORY_SOURCE_ALL
  | 'standalone'
  | 'watchlist'
  | 'orchestration';

export type AgentHistorySourceOption = {
  value: AgentHistorySourceFilter;
  label: string;
};

export type AgentHistorySourceItem = {
  orchestrationId?: string | null;
  orchestration_id?: string | null;
  watchlistItemId?: string | null;
  watchlist_item_id?: string | null;
};

const SOURCE_OPTIONS: readonly AgentHistorySourceOption[] = [
  { value: 'standalone', label: 'Standalone' },
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'orchestration', label: 'Orchestration' },
];

function hasId(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Resolve the most specific source available on a history row. */
function sourceFor(
  item: AgentHistorySourceItem | null | undefined,
): Exclude<AgentHistorySourceFilter, 'all'> {
  const source = item || {};
  // A watchlist task is still an orchestration in some older payloads, but
  // the watchlist origin is the actionable distinction for history users.
  if (hasId(source.watchlistItemId) || hasId(source.watchlist_item_id)) return 'watchlist';
  if (hasId(source.orchestrationId) || hasId(source.orchestration_id)) return 'orchestration';
  return 'standalone';
}

/** Build All sources plus only source categories present in the data. */
export function collectHistorySourceOptions(
  items: AgentHistorySourceItem[],
): AgentHistorySourceOption[] {
  const present = new Set<AgentHistorySourceFilter>(
    (items || []).map((item) => sourceFor(item)),
  );
  return [
    { value: AGENT_HISTORY_SOURCE_ALL, label: 'All sources' },
    ...SOURCE_OPTIONS.filter((option) => present.has(option.value)),
  ];
}

export function agentHistorySourceLabel(
  filter: AgentHistorySourceFilter,
  options: AgentHistorySourceOption[] = [],
): string {
  return (
    options.find((option) => option.value === filter)?.label ||
    SOURCE_OPTIONS.find((option) => option.value === filter)?.label ||
    'All sources'
  );
}

/** Filter history by origin without mutating the input array. */
export function filterAgentHistoryBySource<T extends AgentHistorySourceItem>(
  items: T[],
  filter: AgentHistorySourceFilter,
): T[] {
  const list = items || [];
  if (!filter || filter === AGENT_HISTORY_SOURCE_ALL) return [...list];
  return list.filter((item) => sourceFor(item) === filter);
}

/** True when at least one non-standalone source is available to filter. */
export function agentHistorySourceFilterUseful(items: AgentHistorySourceItem[]): boolean {
  return collectHistorySourceOptions(items).some(
    (option) => option.value !== AGENT_HISTORY_SOURCE_ALL && option.value !== 'standalone',
  );
}
