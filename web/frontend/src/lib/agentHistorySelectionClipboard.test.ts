import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyAgentHistoryCsv } from './agentHistoryCsvClipboard';
import { copyAgentHistoryHtml } from './agentHistoryHtmlClipboard';
import { copyAgentHistoryJson } from './agentHistoryJsonClipboard';
import { copyAgentHistoryJsonl } from './agentHistoryJsonlClipboard';
import { copyAgentHistoryMarkdown } from './agentHistoryMarkdownClipboard';
import {
  copySelectedAgentHistoryCsv,
  copySelectedAgentHistoryHtml,
  copySelectedAgentHistoryJson,
  copySelectedAgentHistoryJsonl,
  copySelectedAgentHistoryMarkdown,
} from './agentHistorySelectionClipboard';

vi.mock('./agentHistoryCsvClipboard', () => ({
  copyAgentHistoryCsv: vi.fn(),
}));

vi.mock('./agentHistoryHtmlClipboard', () => ({
  copyAgentHistoryHtml: vi.fn(),
}));

vi.mock('./agentHistoryJsonClipboard', () => ({
  copyAgentHistoryJson: vi.fn(),
}));

vi.mock('./agentHistoryJsonlClipboard', () => ({
  copyAgentHistoryJsonl: vi.fn(),
}));

vi.mock('./agentHistoryMarkdownClipboard', () => ({
  copyAgentHistoryMarkdown: vi.fn(),
}));

describe('copySelectedAgentHistoryCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies only selected retained rows in source order', async () => {
    vi.mocked(copyAgentHistoryCsv).mockResolvedValueOnce(true);

    await expect(
      copySelectedAgentHistoryCsv(
        [
          { task_id: 'newest', title: 'Newest' },
          { task_id: 'middle', title: 'Middle' },
          { task_id: 'oldest', title: 'Oldest' },
        ],
        ['oldest', 'missing', 'newest', 'oldest'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(true);

    expect(copyAgentHistoryCsv).toHaveBeenCalledWith({
      items: [
        { taskId: 'newest', title: 'Newest' },
        { taskId: 'oldest', title: 'Oldest' },
      ],
    });
  });

  it('does not write an empty or stale selection', async () => {
    await expect(
      copySelectedAgentHistoryCsv(
        [{ task_id: 'task-1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryCsv).not.toHaveBeenCalled();
  });

  it('converts unexpected clipboard exceptions into a refusal', async () => {
    vi.mocked(copyAgentHistoryCsv).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(
      copySelectedAgentHistoryCsv(
        [{ task_id: 'task-1', title: 'One' }],
        ['task-1'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);
  });
});

describe('copySelectedAgentHistoryHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies only selected retained rows in source order with an explicit count', async () => {
    vi.mocked(copyAgentHistoryHtml).mockResolvedValueOnce(true);

    await expect(
      copySelectedAgentHistoryHtml(
        [
          { task_id: 'newest', title: 'Newest' },
          { task_id: 'middle', title: 'Middle' },
          { task_id: 'oldest', title: 'Oldest' },
        ],
        ['oldest', 'missing', 'newest', 'oldest'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(true);

    expect(copyAgentHistoryHtml).toHaveBeenCalledWith({
      items: [
        { taskId: 'newest', title: 'Newest' },
        { taskId: 'oldest', title: 'Oldest' },
      ],
      totalCount: 2,
    });
  });

  it('does not write an empty or stale selection', async () => {
    await expect(
      copySelectedAgentHistoryHtml(
        [{ task_id: 'task-1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryHtml).not.toHaveBeenCalled();
  });

  it('converts unexpected clipboard exceptions into a refusal', async () => {
    vi.mocked(copyAgentHistoryHtml).mockRejectedValueOnce(
      new Error('clipboard unavailable'),
    );

    await expect(
      copySelectedAgentHistoryHtml(
        [{ task_id: 'task-1', title: 'One' }],
        ['task-1'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);
  });
});

describe('copySelectedAgentHistoryJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies only selected retained rows in source order with an explicit count', async () => {
    vi.mocked(copyAgentHistoryJson).mockResolvedValueOnce(true);

    await expect(
      copySelectedAgentHistoryJson(
        [
          { task_id: 'newest', title: 'Newest' },
          { task_id: 'middle', title: 'Middle' },
          { task_id: 'oldest', title: 'Oldest' },
        ],
        ['oldest', 'missing', 'newest', 'oldest'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(true);

    expect(copyAgentHistoryJson).toHaveBeenCalledWith({
      items: [
        { taskId: 'newest', title: 'Newest' },
        { taskId: 'oldest', title: 'Oldest' },
      ],
      totalCount: 2,
    });
  });

  it('does not write an empty or stale selection', async () => {
    await expect(
      copySelectedAgentHistoryJson(
        [{ task_id: 'task-1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryJson).not.toHaveBeenCalled();
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyAgentHistoryJson).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(
      copySelectedAgentHistoryJson(
        [{ task_id: 'task-1', title: 'One' }],
        ['task-1'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);
  });

  it('refuses malformed retained rows without escaping the clipboard boundary', async () => {
    await expect(
      copySelectedAgentHistoryJson(
        [null] as unknown as Array<{ task_id: string }>,
        ['task-1'],
        (item) => ({ taskId: item.task_id }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryJson).not.toHaveBeenCalled();
  });
});

describe('copySelectedAgentHistoryJsonl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies only selected retained rows in source order', async () => {
    vi.mocked(copyAgentHistoryJsonl).mockResolvedValueOnce(true);

    await expect(
      copySelectedAgentHistoryJsonl(
        [
          { task_id: 'newest', title: 'Newest' },
          { task_id: 'middle', title: 'Middle' },
          { task_id: 'oldest', title: 'Oldest' },
        ],
        ['oldest', 'missing', 'newest', 'oldest'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(true);

    expect(copyAgentHistoryJsonl).toHaveBeenCalledWith({
      items: [
        { taskId: 'newest', title: 'Newest' },
        { taskId: 'oldest', title: 'Oldest' },
      ],
    });
  });

  it('does not write an empty or stale selection', async () => {
    await expect(
      copySelectedAgentHistoryJsonl(
        [{ task_id: 'task-1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryJsonl).not.toHaveBeenCalled();
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyAgentHistoryJsonl).mockRejectedValueOnce(
      new Error('clipboard unavailable'),
    );

    await expect(
      copySelectedAgentHistoryJsonl(
        [{ task_id: 'task-1', title: 'One' }],
        ['task-1'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);
  });

  it('refuses malformed retained rows without escaping the clipboard boundary', async () => {
    await expect(
      copySelectedAgentHistoryJsonl(
        [null] as unknown as Array<{ task_id: string }>,
        ['task-1'],
        (item) => ({ taskId: item.task_id }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryJsonl).not.toHaveBeenCalled();
  });
});

describe('copySelectedAgentHistoryMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies only selected retained rows in source order with an explicit count', async () => {
    vi.mocked(copyAgentHistoryMarkdown).mockResolvedValueOnce(true);

    await expect(
      copySelectedAgentHistoryMarkdown(
        [
          { task_id: 'newest', title: 'Newest' },
          { task_id: 'middle', title: 'Middle' },
          { task_id: 'oldest', title: 'Oldest' },
        ],
        ['oldest', 'missing', 'newest', 'oldest'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(true);

    expect(copyAgentHistoryMarkdown).toHaveBeenCalledWith({
      items: [
        { taskId: 'newest', title: 'Newest' },
        { taskId: 'oldest', title: 'Oldest' },
      ],
      totalCount: 2,
    });
  });

  it('does not write an empty or stale selection', async () => {
    await expect(
      copySelectedAgentHistoryMarkdown(
        [{ task_id: 'task-1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryMarkdown).not.toHaveBeenCalled();
  });

  it('converts unexpected clipboard exceptions into a refusal', async () => {
    vi.mocked(copyAgentHistoryMarkdown).mockRejectedValueOnce(
      new Error('clipboard unavailable'),
    );

    await expect(
      copySelectedAgentHistoryMarkdown(
        [{ task_id: 'task-1', title: 'One' }],
        ['task-1'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);
  });
});
