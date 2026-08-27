import { formatAgentHistoryCsv, type AgentHistoryExportItem } from './agentHistoryExport';
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
