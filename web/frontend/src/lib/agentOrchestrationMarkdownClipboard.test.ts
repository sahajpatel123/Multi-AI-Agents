import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyMarkdownToClipboard } from './clipboard';
import { copyAgentOrchestrationMarkdown } from './agentOrchestrationMarkdownClipboard';

vi.mock('./clipboard', () => ({
  copyMarkdownToClipboard: vi.fn(),
}));

describe('copyAgentOrchestrationMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies history through the Markdown-aware clipboard helper', async () => {
    const markdown = '# Arena orchestration history\n\n## Complete\n';
    vi.mocked(copyMarkdownToClipboard).mockResolvedValueOnce(true);

    await expect(copyAgentOrchestrationMarkdown(markdown)).resolves.toBe(true);

    expect(copyMarkdownToClipboard).toHaveBeenCalledWith(markdown);
  });

  it('returns clipboard refusal so the page can show its download fallback', async () => {
    vi.mocked(copyMarkdownToClipboard).mockResolvedValueOnce(false);

    await expect(copyAgentOrchestrationMarkdown('# History\n')).resolves.toBe(false);
  });

  it('turns unexpected clipboard rejection into ordinary failure feedback', async () => {
    vi.mocked(copyMarkdownToClipboard).mockRejectedValueOnce(
      new Error('clipboard unavailable'),
    );

    await expect(copyAgentOrchestrationMarkdown('# History\n')).resolves.toBe(false);
  });
});
