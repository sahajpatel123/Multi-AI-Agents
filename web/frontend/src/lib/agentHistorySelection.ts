/** Select retained Agent history rows without changing their source order. */

export type SelectableAgentHistoryItem = {
  task_id: string;
};

/**
 * Return only rows whose ids are selected, preserving the history API order.
 * Missing or duplicated ids are harmless, which keeps bulk actions safe after
 * filters or a refresh change the visible selection.
 */
export function selectAgentHistoryItems<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
): T[] {
  const selected = new Set(selectedTaskIds);
  return items.filter((item) => selected.has(item.task_id));
}
