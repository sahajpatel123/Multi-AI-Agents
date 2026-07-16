/** User-feedback filter for Agent research history. */

export type AgentHistoryFeedbackFilter =
  | 'all'
  | 'accurate'
  | 'partial'
  | 'inaccurate'
  | 'unrated';

export const AGENT_HISTORY_FEEDBACK_OPTIONS: Array<{
  value: AgentHistoryFeedbackFilter;
  label: string;
}> = [
  { value: 'all', label: 'All ratings' },
  { value: 'accurate', label: 'Accurate' },
  { value: 'partial', label: 'Partial' },
  { value: 'inaccurate', label: 'Inaccurate' },
  { value: 'unrated', label: 'Unrated' },
];

export function agentHistoryFeedbackLabel(filter: AgentHistoryFeedbackFilter): string {
  return AGENT_HISTORY_FEEDBACK_OPTIONS.find((o) => o.value === filter)?.label || 'All ratings';
}

export type AgentHistoryFeedbackItem = {
  user_feedback?: string | null;
};

const KNOWN_VERDICTS = new Set(['accurate', 'partial', 'inaccurate']);

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isRated(value: string | null | undefined): boolean {
  return KNOWN_VERDICTS.has(normalize(value));
}

/**
 * Filter history by user-feedback verdict. Does not mutate the input.
 * Recognised verdicts: "accurate", "partial", "inaccurate". Anything else
 * (null / empty / unknown) is treated as unrated — a safe fallback for
 * legacy rows whose verdict string isn't one of the known three.
 */
export function filterAgentHistoryByFeedback<T extends AgentHistoryFeedbackItem>(
  items: T[],
  filter: AgentHistoryFeedbackFilter,
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  return list.filter((item) => {
    if (filter === 'unrated') return !isRated(item.user_feedback);
    return normalize(item.user_feedback) === filter;
  });
}

/** True when feedback chips add value (at least one rated item present). */
export function agentHistoryFeedbackFilterUseful(items: AgentHistoryFeedbackItem[]): boolean {
  return (items || []).some((item) => isRated(item.user_feedback));
}
