/** Score-band filter for Agent research history. */

export type AgentHistoryScoreFilter = 'all' | 'high' | 'solid' | 'mixed' | 'unscored';

export const AGENT_HISTORY_SCORE_OPTIONS: Array<{
  value: AgentHistoryScoreFilter;
  label: string;
}> = [
  { value: 'all', label: 'All scores' },
  { value: 'high', label: '75+' },
  { value: 'solid', label: '60–74' },
  { value: 'mixed', label: 'Below 60' },
  { value: 'unscored', label: 'No score' },
];

export function agentHistoryScoreLabel(filter: AgentHistoryScoreFilter): string {
  return AGENT_HISTORY_SCORE_OPTIONS.find((o) => o.value === filter)?.label || 'All scores';
}

export type AgentHistoryScoreItem = {
  score?: number | null;
  final_score?: number | null;
};

function resolveScore(item: AgentHistoryScoreItem): number | null {
  const raw =
    typeof item.score === 'number' && Number.isFinite(item.score)
      ? item.score
      : typeof item.final_score === 'number' && Number.isFinite(item.final_score)
        ? item.final_score
        : null;
  return raw;
}

/**
 * Filter history by score band. Does not mutate the input.
 * Bands: high ≥75, solid 60–74, mixed &lt;60, unscored = missing score.
 */
export function filterAgentHistoryByScore<T extends AgentHistoryScoreItem>(
  items: T[],
  filter: AgentHistoryScoreFilter,
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  return list.filter((item) => {
    const score = resolveScore(item);
    if (filter === 'unscored') return score == null;
    if (score == null) return false;
    if (filter === 'high') return score >= 75;
    if (filter === 'solid') return score >= 60 && score < 75;
    return score < 60;
  });
}

/** True when score chips add value (at least one scored item). */
export function agentHistoryScoreFilterUseful(items: AgentHistoryScoreItem[]): boolean {
  return (items || []).some((item) => resolveScore(item) != null);
}
