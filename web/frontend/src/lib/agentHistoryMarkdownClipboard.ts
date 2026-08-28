import { copyMarkdownToClipboard } from './clipboard';
import { formatAgentHistoryExport } from './agentHistoryExport';

/**
 * Copy an Agent history export with Markdown-aware and plain-text clipboard
 * representations. Keep this adapter total so the history toolbar can turn
 * browser clipboard failures into ordinary UI feedback.
 */
export async function copyAgentHistoryMarkdown(
  opts: Parameters<typeof formatAgentHistoryExport>[0],
): Promise<boolean> {
  try {
    return await copyMarkdownToClipboard(formatAgentHistoryExport(opts));
  } catch {
    return false;
  }
}
