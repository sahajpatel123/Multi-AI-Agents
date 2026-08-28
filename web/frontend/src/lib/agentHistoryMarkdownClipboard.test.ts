import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyMarkdownToClipboard } from './clipboard';
import { copyAgentHistoryMarkdown } from './agentHistoryMarkdownClipboard';

vi.mock('./clipboard', () => ({
  copyMarkdownToClipboard: vi.fn(),
}));

describe('copyAgentHistoryMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the selected history envelope as Markdown', async () => {
    vi.mocked(copyMarkdownToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentHistoryMarkdown({
        items: [
          {
            taskId: 'task_123',
            title: 'Rate path scan',
            question: 'Will rates cut this quarter?',
            score: 84,
          },
        ],
        totalCount: 1,
      }),
    ).resolves.toBe(true);

    expect(copyMarkdownToClipboard).toHaveBeenCalledTimes(1);
    const [markdown] = vi.mocked(copyMarkdownToClipboard).mock.calls[0];
    expect(markdown).toContain('# Agent research history');
    expect(markdown).toContain('## 1. Rate path scan');
    expect(markdown).toContain('**Question:** Will rates cut this quarter?');
  });

  it('returns a clipboard refusal without throwing', async () => {
    vi.mocked(copyMarkdownToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(copyAgentHistoryMarkdown({ items: [] })).resolves.toBe(false);
  });
});
