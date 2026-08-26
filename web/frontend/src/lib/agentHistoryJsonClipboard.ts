import { copyJsonToClipboard } from './clipboard';
import { formatAgentHistoryJson } from './agentHistoryExport';

/**
 * Copy an Agent history export with JSON-aware and plain-text clipboard data.
 * Clipboard implementations are browser-provided and can still throw outside
 * their normal refusal result, so keep this adapter total for UI callers.
 */
export async function copyAgentHistoryJson(
  opts: Parameters<typeof formatAgentHistoryJson>[0],
): Promise<boolean> {
  try {
    return await copyJsonToClipboard(formatAgentHistoryJson(opts));
  } catch {
    return false;
  }
}
