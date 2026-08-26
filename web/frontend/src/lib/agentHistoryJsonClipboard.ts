import { copyJsonToClipboard } from './clipboard';
import { formatAgentHistoryJson } from './agentHistoryExport';

/** Copy an Agent history export with JSON-aware and plain-text clipboard data. */
export async function copyAgentHistoryJson(
  opts: Parameters<typeof formatAgentHistoryJson>[0],
): Promise<boolean> {
  return copyJsonToClipboard(formatAgentHistoryJson(opts));
}
