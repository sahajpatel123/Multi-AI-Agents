import {
  formatAgentHistoryCsv,
  formatAgentHistoryExport,
  formatAgentHistoryHtml,
  formatAgentHistoryJson,
  formatAgentHistoryJsonl,
  type AgentHistoryExportItem,
} from './agentHistoryExport';
import {
  selectAgentHistoryItems,
  type SelectableAgentHistoryItem,
} from './agentHistorySelection';

/**
 * Format only retained history rows selected by the user as CSV.
 *
 * Keeping selection and serialization together prevents bulk export callers
 * from accidentally exporting the filtered view instead of the explicit
 * selection (which may include rows hidden by the current filters).
 */
export function formatSelectedAgentHistoryCsv<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): string | null {
  const selected = selectAgentHistoryItems(items, selectedTaskIds);
  if (selected.length === 0) return null;
  return formatAgentHistoryCsv({ items: selected.map(toExportItem) });
}

/**
 * Format only retained history rows selected by the user as Markdown.
 *
 * The explicit selection is resolved against retained rows before formatting,
 * so rows hidden by the current filters still export while stale ids do not.
 */
export function formatSelectedAgentHistoryMarkdown<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): string | null {
  const selected = selectAgentHistoryItems(items, selectedTaskIds);
  if (selected.length === 0) return null;
  return formatAgentHistoryExport({
    items: selected.map(toExportItem),
    totalCount: selected.length,
  });
}

/**
 * Format only retained history rows selected by the user as a standalone HTML
 * archive.
 *
 * The selected count is used as the archive total because this action is an
 * explicit curation, not a filtered view whose rows are a subset of a larger
 * result set.
 */
export function formatSelectedAgentHistoryHtml<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): string | null {
  const selected = selectAgentHistoryItems(items, selectedTaskIds);
  if (selected.length === 0) return null;
  return formatAgentHistoryHtml({
    items: selected.map(toExportItem),
    totalCount: selected.length,
  });
}

/**
 * Format only retained history rows selected by the user as JSON.
 *
 * The envelope keeps the selected count explicit while reusing the stable
 * history export field names used by the unfiltered JSON action.
 */
export function formatSelectedAgentHistoryJson<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): string | null {
  const selected = selectAgentHistoryItems(items, selectedTaskIds);
  if (selected.length === 0) return null;
  return formatAgentHistoryJson({
    items: selected.map(toExportItem),
    totalCount: selected.length,
  });
}

/**
 * Format only retained history rows selected by the user as JSONL.
 *
 * Keep selection resolution beside the other selected export formats so the
 * download and clipboard actions cannot drift on stale ids or duplicate rows.
 */
export function formatSelectedAgentHistoryJsonl<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): string | null {
  const selected = selectAgentHistoryItems(items, selectedTaskIds);
  if (selected.length === 0) return null;
  return formatAgentHistoryJsonl({ items: selected.map(toExportItem) });
}
