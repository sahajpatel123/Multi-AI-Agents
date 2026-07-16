/** Sort helpers for Agent Mode research history. */

export type AgentHistorySort =
  | 'newest'
  | 'oldest'
  | 'score_desc'
  | 'score_asc'
  | 'title'
  | 'live_first';

export const AGENT_HISTORY_SORT_OPTIONS: Array<{ value: AgentHistorySort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'score_desc', label: 'Score · high' },
  { value: 'score_asc', label: 'Score · low' },
  { value: 'title', label: 'Title' },
  { value: 'live_first', label: 'Live first' },
];

export function agentHistorySortLabel(sort: AgentHistorySort): string {
  return AGENT_HISTORY_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Newest';
}

export type AgentHistorySortableItem = {
  title?: string | null;
  question?: string | null;
  score?: number | null;
  createdAt?: string | null;
  isLive?: boolean | null;
  /** Stable tie-breaker (task id). */
  id?: string | null;
};

function createdMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function displayTitle(item: AgentHistorySortableItem): string {
  return (item.title || item.question || '').trim() || 'zzz';
}

/**
 * Sort Agent history for display / export. Does not mutate the input.
 */
export function sortAgentHistoryItems<T extends AgentHistorySortableItem>(
  items: T[],
  sort: AgentHistorySort,
): T[] {
  const list = [...(items || [])];
  const tie = (a: T, b: T) => cmpStr(String(a.id || ''), String(b.id || ''));

  list.sort((a, b) => {
    switch (sort) {
      case 'oldest': {
        const d = createdMs(a.createdAt) - createdMs(b.createdAt);
        return d !== 0 ? d : tie(a, b);
      }
      case 'score_desc': {
        const sa =
          typeof a.score === 'number' && Number.isFinite(a.score)
            ? a.score
            : Number.NEGATIVE_INFINITY;
        const sb =
          typeof b.score === 'number' && Number.isFinite(b.score)
            ? b.score
            : Number.NEGATIVE_INFINITY;
        if (sa === Number.NEGATIVE_INFINITY && sb === Number.NEGATIVE_INFINITY) return tie(a, b);
        if (sa === Number.NEGATIVE_INFINITY) return 1;
        if (sb === Number.NEGATIVE_INFINITY) return -1;
        const d = sb - sa;
        return d !== 0 ? d : tie(a, b);
      }
      case 'score_asc': {
        const sa =
          typeof a.score === 'number' && Number.isFinite(a.score)
            ? a.score
            : Number.POSITIVE_INFINITY;
        const sb =
          typeof b.score === 'number' && Number.isFinite(b.score)
            ? b.score
            : Number.POSITIVE_INFINITY;
        const d = sa - sb;
        return d !== 0 ? d : tie(a, b);
      }
      case 'title': {
        const d = cmpStr(displayTitle(a), displayTitle(b));
        return d !== 0 ? d : tie(a, b);
      }
      case 'live_first': {
        const la = a.isLive ? 1 : 0;
        const lb = b.isLive ? 1 : 0;
        if (la !== lb) return lb - la;
        const d = createdMs(b.createdAt) - createdMs(a.createdAt);
        return d !== 0 ? d : tie(a, b);
      }
      case 'newest':
      default: {
        const d = createdMs(b.createdAt) - createdMs(a.createdAt);
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}
