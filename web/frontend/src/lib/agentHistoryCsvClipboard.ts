import { copyCsvToClipboard } from './clipboard';
import { formatAgentHistoryCsv } from './agentHistoryExport';

/**
 * Copy an Agent history export with spreadsheet-aware and plain-text
 * clipboard representations. Keep this adapter total so the history toolbar
 * can always turn clipboard failures into visible feedback.
 */
export async function copyAgentHistoryCsv(
  opts: Parameters<typeof formatAgentHistoryCsv>[0],
): Promise<boolean> {
  try {
    return await copyCsvToClipboard(formatAgentHistoryCsv(opts));
  } catch {
    return false;
  }
}
