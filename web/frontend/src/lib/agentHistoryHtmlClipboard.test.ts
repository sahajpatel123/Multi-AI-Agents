import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyHtmlToClipboard } from './clipboard';
import { copyAgentHistoryHtml } from './agentHistoryHtmlClipboard';

vi.mock('./clipboard', () => ({
  copyHtmlToClipboard: vi.fn(),
}));

describe('copyAgentHistoryHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the filtered history as rich HTML with a Markdown fallback', async () => {
    vi.mocked(copyHtmlToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentHistoryHtml({
        items: [
          {
            taskId: 'task_123',
            title: 'Rate path scan',
            question: 'Will rates cut this quarter?',
            score: 84,
          },
        ],
        totalCount: 4,
        filterNote: 'score: 75+',
        exportedAt: '2026-08-28T12:00:00.000Z',
      }),
    ).resolves.toBe(true);

    expect(copyHtmlToClipboard).toHaveBeenCalledTimes(1);
    const [html, plainText] = vi.mocked(copyHtmlToClipboard).mock.calls[0];
    expect(html).toContain('data-format="arena-agent-history"');
    expect(html).toContain('Rate path scan');
    expect(plainText).toContain('# Agent research history');
    expect(plainText).toContain('**1** of **4** tasks in this view');
    expect(plainText).toContain('_Filtered view: score: 75\\+_');
  });

  it('copies an empty view so the destination still receives its empty state', async () => {
    vi.mocked(copyHtmlToClipboard).mockResolvedValueOnce(true);

    await expect(copyAgentHistoryHtml({ items: [] })).resolves.toBe(true);

    const [html, plainText] = vi.mocked(copyHtmlToClipboard).mock.calls[0];
    expect(html).toContain('No research tasks in this view.');
    expect(plainText).toContain('_No research tasks in this view._');
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyHtmlToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(copyAgentHistoryHtml({ items: [{ taskId: 'task_123' }] })).resolves.toBe(false);
  });
});
