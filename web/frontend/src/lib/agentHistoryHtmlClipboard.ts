import { copyHtmlToClipboard } from './clipboard';
import { formatAgentHistoryExport, formatAgentHistoryHtml } from './agentHistoryExport';

/**
 * Copy the current Agent history view as rich HTML with a readable Markdown
 * fallback for text-only destinations. Keep this adapter total so browser
 * clipboard failures become ordinary toolbar feedback instead of an
 * unhandled promise rejection.
 */
export async function copyAgentHistoryHtml(
  opts: Parameters<typeof formatAgentHistoryHtml>[0],
): Promise<boolean> {
  try {
    const html = formatAgentHistoryHtml(opts);
    const plainText = formatAgentHistoryExport({
      items: opts.items,
      totalCount: opts.totalCount,
      filterNote: opts.filterNote,
    });
    return await copyHtmlToClipboard(html, plainText);
  } catch {
    return false;
  }
}
