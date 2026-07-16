/** Confidence-band filter for Agent research history. */

export type AgentHistoryConfidenceFilter = 'all' | 'high' | 'solid' | 'mixed' | 'unrated';

export const AGENT_HISTORY_CONFIDENCE_OPTIONS: Array<{
  value: AgentHistoryConfidenceFilter;
  label: string;
}> = [
  { value: 'all', label: 'All confidence' },
  { value: 'high', label: '75+' },
  { value: 'solid', label: '60–74' },
  { value: 'mixed', label: 'Below 60' },
  { value: 'unrated', label: 'No rating' },
];

export function agentHistoryConfidenceLabel(filter: AgentHistoryConfidenceFilter): string {
  return (
    AGENT_HISTORY_CONFIDENCE_OPTIONS.find((o) => o.value === filter)?.label || 'All confidence'
  );
}

export type AgentHistoryConfidenceItem = {
  final_confidence?: number | null;
};

function resolveConfidence(item: AgentHistoryConfidenceItem): number | null {
  const raw = item.final_confidence;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  // Agent payloads sometimes store 0–1 fractions; band thresholds are percent.
  if (raw >= 0 && raw <= 1) return raw * 100;
  return raw;
}

/**
 * Filter history by confidence band. Does not mutate the input.
 * Bands: high ≥75, solid 60–74, mixed &lt;60, unrated = missing confidence.
 */
export function filterAgentHistoryByConfidence<T extends AgentHistoryConfidenceItem>(
  items: T[],
  filter: AgentHistoryConfidenceFilter,
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  return list.filter((item) => {
    const confidence = resolveConfidence(item);
    if (filter === 'unrated') return confidence == null;
    if (confidence == null) return false;
    if (filter === 'high') return confidence >= 75;
    if (filter === 'solid') return confidence >= 60 && confidence < 75;
    return confidence < 60;
  });
}

/** True when confidence chips add value (at least one rated item). */
export function agentHistoryConfidenceFilterUseful(
  items: AgentHistoryConfidenceItem[],
): boolean {
  return (items || []).some((item) => resolveConfidence(item) != null);
}
