import { copyMarkdownToClipboard } from './clipboard';

/**
 * Copy orchestration history with both Markdown and plain-text clipboard
 * representations. Keeping the network request outside this adapter lets the
 * page invalidate stale fetches before they mutate the user's clipboard.
 */
export async function copyAgentOrchestrationMarkdown(
  markdown: string,
): Promise<boolean> {
  try {
    return await copyMarkdownToClipboard(markdown);
  } catch {
    return false;
  }
}
