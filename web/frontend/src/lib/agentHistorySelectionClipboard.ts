import { copyAgentHistoryCsv } from './agentHistoryCsvClipboard';
import { copyAgentHistoryHtml } from './agentHistoryHtmlClipboard';
import { copyAgentHistoryJson } from './agentHistoryJsonClipboard';
import { copyAgentHistoryJsonl } from './agentHistoryJsonlClipboard';
import { copyAgentHistoryMarkdown } from './agentHistoryMarkdownClipboard';
import {
  selectAgentHistoryItems,
  type SelectableAgentHistoryItem,
} from './agentHistorySelection';
import type { AgentHistoryExportItem } from './agentHistoryExport';

/**
 * Copy exactly the retained Agent history rows selected by the user as rich
 * HTML, with the adapter's Markdown fallback for text-only destinations.
 * Resolve ids before formatting so hidden rows remain included while stale
 * selections and duplicate runtime rows are ignored.
 */
export async function copySelectedAgentHistoryHtml<T extends SelectableAgentHistoryItem>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): Promise<boolean> {
  try {
    const selected = selectAgentHistoryItems(items, selectedTaskIds);
    if (selected.length === 0) return false;

    return await copyAgentHistoryHtml({
      items: selected.map(toExportItem),
      totalCount: selected.length,
    });
  } catch {
    return false;
  }
}

/**
 * Copy exactly the retained Agent history rows selected by the user as CSV.
 * Resolve ids against retained rows before formatting so a stale selection
 * cannot copy an unrelated filtered view or duplicate records.
 */
export async function copySelectedAgentHistoryCsv<
  T extends SelectableAgentHistoryItem,
>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): Promise<boolean> {
  try {
    const selected = selectAgentHistoryItems(items, selectedTaskIds);
    if (selected.length === 0) return false;

    return await copyAgentHistoryCsv({
      items: selected.map(toExportItem),
    });
  } catch {
    return false;
  }
}

/**
 * Copy exactly the retained Agent history rows selected by the user as JSONL.
 * Resolve ids before formatting so stale selections cannot copy a filtered
 * view or produce duplicate records.
 */
export async function copySelectedAgentHistoryJsonl<
  T extends SelectableAgentHistoryItem,
>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): Promise<boolean> {
  try {
    const selected = selectAgentHistoryItems(items, selectedTaskIds);
    if (selected.length === 0) return false;

    return await copyAgentHistoryJsonl({
      items: selected.map(toExportItem),
    });
  } catch {
    return false;
  }
}

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

/**
 * Copy exactly the retained Agent history rows selected by the user as
 * Markdown. Resolve ids before formatting so stale selections cannot copy a
 * filtered view or produce duplicate records.
 */
export async function copySelectedAgentHistoryMarkdown<
  T extends SelectableAgentHistoryItem,
>(
  items: readonly T[],
  selectedTaskIds: readonly string[],
  toExportItem: (item: T) => AgentHistoryExportItem,
): Promise<boolean> {
  try {
    // Keep selection resolution inside the same total boundary as
    // serialization. API-shaped rows can be malformed at runtime, and a
    // clipboard action should refuse safely rather than escape its click
    // handler.
    const selected = selectAgentHistoryItems(items, selectedTaskIds);
    if (selected.length === 0) return false;

    return await copyAgentHistoryMarkdown({
      items: selected.map(toExportItem),
      totalCount: selected.length,
    });
  } catch {
    return false;
  }
}
