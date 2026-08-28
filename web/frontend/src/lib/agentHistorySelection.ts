/** Select retained Agent history rows without changing their source order. */

export type SelectableAgentHistoryItem = {
  task_id: string;
};

/**
 * Return only rows whose ids are selected, preserving the history API order.
 * Missing or duplicated selection ids are harmless, which keeps bulk actions
 * safe after filters or a refresh change the visible selection. If a malformed
 * payload repeats a retained task id, keep its first row so a selected export
 * cannot duplicate one task in the output.
 */
export function selectAgentHistoryItems<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
): T[] {
  const selected = new Set(selectedTaskIds);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!selected.has(item.task_id) || seen.has(item.task_id)) return false;
    seen.add(item.task_id);
    return true;
  });
}
