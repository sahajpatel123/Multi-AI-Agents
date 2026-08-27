import { copyJsonlToClipboard } from './clipboard';
import { formatAgentHistoryJsonl } from './agentHistoryExport';

/**
 * Copy filtered Agent history as one JSON object per line. Keep this adapter
 * total so clipboard API failures become ordinary UI feedback rather than an
 * unhandled promise rejection in the history sidebar.
 */
export async function copyAgentHistoryJsonl(
  opts: Parameters<typeof formatAgentHistoryJsonl>[0],
): Promise<boolean> {
  try {
    return await copyJsonlToClipboard(formatAgentHistoryJsonl(opts));
  } catch {
    return false;
  }
}
