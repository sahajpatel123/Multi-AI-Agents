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
  // History and selection state originate at runtime boundaries. Keep a bad
  // payload from aborting an otherwise valid bulk export or clipboard action.
  if (!Array.isArray(items) || !Array.isArray(selectedTaskIds)) return [];

  const selected = new Set(
    selectedTaskIds.filter((taskId): taskId is string => typeof taskId === 'string'),
  );
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const taskId = (item as SelectableAgentHistoryItem).task_id;
    if (typeof taskId !== 'string' || !taskId || !selected.has(taskId) || seen.has(taskId)) {
      return false;
    }
    seen.add(taskId);
    return true;
  });
}
