import { copyAgentHistoryJson } from './agentHistoryJsonClipboard';
import {
  selectAgentHistoryItems,
  type SelectableAgentHistoryItem,
} from './agentHistorySelection';
import type { AgentHistoryExportItem } from './agentHistoryExport';

/**
 * Copy exactly the retained Agent history rows selected by the user as JSON.
 *
 * Resolve ids against retained rows before handing them to the clipboard
 * adapter so a stale selection cannot copy an unrelated filtered view or
 * produce duplicate records.
 */
export async function copySelectedAgentHistoryJson<
  T extends SelectableAgentHistoryItem,
>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): Promise<boolean> {
  try {
    // History is API data at runtime, so keep selection resolution inside the
    // same total boundary as serialization. A malformed collection or row
    // must refuse the copy instead of escaping through a click handler.
    const selected = selectAgentHistoryItems(items, selectedTaskIds);
    if (selected.length === 0) return false;

    return await copyAgentHistoryJson({
      items: selected.map(toExportItem),
      totalCount: selected.length,
    });
  } catch {
    // Keep this boundary total if a future clipboard adapter changes its
    // refusal contract or throws before returning a boolean.
    return false;
  }
}
