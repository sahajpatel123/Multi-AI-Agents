/** Helpers for reconciling bulk history deletion with a stale browser view. */

function normalizedIds(ids: readonly string[]): string[] {
  return ids
    .map((id) => id.trim())
    .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);
}

/**
 * Return selected ids that the server accounted for as deleted or skipped.
 *
 * A skipped id is normally a task another tab already removed. Treating it as
 * resolved keeps the local history and pin list from showing a row that no
 * longer exists on the server.
 */
export function reconcileAgentHistoryBulkDeleteIds(
  selectedTaskIds: readonly string[],
  deletedTaskIds: readonly string[],
  skippedTaskIds: readonly string[],
): string[] {
  const selected = normalizedIds(selectedTaskIds);
  const accountedFor = new Set(normalizedIds([...deletedTaskIds, ...skippedTaskIds]));
  return selected.filter((taskId) => accountedFor.has(taskId));
}
