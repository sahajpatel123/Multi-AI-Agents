/** Topic filter for Agent research history. */

export const AGENT_HISTORY_TOPIC_ALL = 'all' as const;

export type AgentHistoryTopicFilter = typeof AGENT_HISTORY_TOPIC_ALL | string;

export type AgentHistoryTopicOption = {
  value: AgentHistoryTopicFilter;
  label: string;
};

export type AgentHistoryTopicItem = {
  topics?: string[] | null;
};

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

function displayTopic(topic: string): string {
  const t = topic.trim();
  if (!t) return 'Untitled';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Build All topics + unique topic chips from history items.
 * Caps at the most common topics when there are many.
 */
export function collectHistoryTopicOptions(
  items: AgentHistoryTopicItem[],
  maxTopics = 8,
): AgentHistoryTopicOption[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of items || []) {
    for (const raw of item.topics || []) {
      const key = normalizeTopic(raw || '');
      if (!key) continue;
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(key, { label: displayTopic(raw), count: 1 });
      }
    }
  }

  const topics = [...counts.entries()]
    .map(([value, meta]) => ({ value, label: meta.label, count: meta.count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
    })
    .slice(0, Math.max(1, maxTopics))
    .map(({ value, label }) => ({ value, label }));

  return [{ value: AGENT_HISTORY_TOPIC_ALL, label: 'All topics' }, ...topics];
}

export function agentHistoryTopicLabel(
  filter: AgentHistoryTopicFilter,
  options: AgentHistoryTopicOption[],
): string {
  return options.find((o) => o.value === filter)?.label || 'All topics';
}

/**
 * Filter history by topic membership. Does not mutate the input.
 */
export function filterAgentHistoryByTopic<T extends AgentHistoryTopicItem>(
  items: T[],
  filter: AgentHistoryTopicFilter,
): T[] {
  const list = items || [];
  if (!filter || filter === AGENT_HISTORY_TOPIC_ALL) return [...list];
  return list.filter((item) =>
    (item.topics || []).some((t) => normalizeTopic(t || '') === filter),
  );
}

/** True when at least one topic chip beyond All is available. */
export function agentHistoryTopicFilterUseful(items: AgentHistoryTopicItem[]): boolean {
  return collectHistoryTopicOptions(items, 2).length > 1;
}
