import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiscussHistoryDrawer } from './DiscussHistoryDrawer';
import * as apiModule from '../api';

vi.mock('../api', () => ({
  listDiscussThreads: vi.fn(),
  getDiscussThread: vi.fn(),
  deleteDiscussThread: vi.fn(),
}));

const mockedApi = vi.mocked(apiModule);

const summary = {
  id: 7,
  agentId: 'claude-sonnet',
  title: 'Why did the migration fail?',
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  messageCount: 2,
};

const detail = {
  ...summary,
  messages: [
    { role: 'user' as const, content: 'Why did the migration fail?', timestamp: '2026-08-23T07:00:00Z' },
    { role: 'agent' as const, content: 'The lock table was stale.', timestamp: '2026-08-23T07:30:00Z' },
  ],
  originalPrompt: 'Why did the migration fail?',
  originalVerdict: 'Stale lock table.',
};

describe('DiscussHistoryDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listDiscussThreads.mockResolvedValue({
      threads: [summary],
      total: 1,
      totalPages: 1,
    });
  });

  it('lists saved threads with their metadata', async () => {
    render(<DiscussHistoryDrawer />);

    expect(
      await screen.findByText('Why did the migration fail?'),
    ).toBeInTheDocument();
    expect(screen.getByText(/claude-sonnet · just now · 2 messages/)).toBeInTheDocument();
    expect(mockedApi.listDiscussThreads).toHaveBeenCalledWith({ perPage: 20 });
  });

  it('shows the empty state when nothing has been saved', async () => {
    mockedApi.listDiscussThreads.mockResolvedValue({ threads: [], total: 0, totalPages: 0 });
    render(<DiscussHistoryDrawer />);

    expect(
      await screen.findByText(/No saved discussions yet/),
    ).toBeInTheDocument();
  });

  it('expands a thread on click, fetching its body once', async () => {
    mockedApi.getDiscussThread.mockResolvedValue(detail);
    render(<DiscussHistoryDrawer />);

    fireEvent.click(
      await screen.findByRole('button', { name: /^why did the migration fail\?/i }),
    );

    expect(await screen.findByText('The lock table was stale.')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText(/From: Why did the migration fail\?/)).toBeInTheDocument();
    expect(mockedApi.getDiscussThread).toHaveBeenCalledTimes(1);
    expect(mockedApi.getDiscussThread).toHaveBeenCalledWith(7);

    // Collapse and re-expand: the cached body means no second fetch.
    fireEvent.click(screen.getByRole('button', { name: /^why did the migration fail\?/i }));
    fireEvent.click(screen.getByRole('button', { name: /^why did the migration fail\?/i }));
    expect(mockedApi.getDiscussThread).toHaveBeenCalledTimes(1);
  });

  it('arms a confirm step before deleting and sends nothing on first click', async () => {
    render(<DiscussHistoryDrawer />);

    fireEvent.click(
      await screen.findByRole('button', { name: /delete saved discussion why did the migration fail/i }),
    );

    // The row asks before destroying anything — deletion has no undo.
    expect(screen.getByText('Delete forever?')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /confirm deleting why did the migration fail/i }),
    ).toBeInTheDocument();
    expect(mockedApi.deleteDiscussThread).not.toHaveBeenCalled();
  });

  it('keeps the thread when the confirm step is cancelled', async () => {
    render(<DiscussHistoryDrawer />);

    fireEvent.click(
      await screen.findByRole('button', { name: /delete saved discussion why did the migration fail/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /keep why did the migration fail/i }));

    expect(screen.queryByText('Delete forever?')).not.toBeInTheDocument();
    expect(screen.getByText('Why did the migration fail?')).toBeInTheDocument();
    expect(mockedApi.deleteDiscussThread).not.toHaveBeenCalled();
  });

  it('deletes a thread only after confirmation, removing the row', async () => {
    mockedApi.deleteDiscussThread.mockResolvedValue(undefined);
    render(<DiscussHistoryDrawer />);

    fireEvent.click(
      await screen.findByRole('button', { name: /delete saved discussion why did the migration fail/i }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /confirm deleting why did the migration fail/i }),
    );

    await waitFor(() => {
      expect(mockedApi.deleteDiscussThread).toHaveBeenCalledWith(7);
      expect(
        screen.queryByText('Why did the migration fail?'),
      ).not.toBeInTheDocument();
    });
  });

  it('surfaces a delete refusal verbatim and keeps the row', async () => {
    mockedApi.deleteDiscussThread.mockRejectedValue(
      new Error('Too many thread deletes. Limit is 60 per hour.'),
    );
    render(<DiscussHistoryDrawer />);

    fireEvent.click(
      await screen.findByRole('button', { name: /delete saved discussion why did the migration fail/i }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /confirm deleting why did the migration fail/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many thread deletes. Limit is 60 per hour.',
    );
    expect(screen.getByText('Why did the migration fail?')).toBeInTheDocument();
  });

  it('shows a load failure with a working Retry', async () => {
    mockedApi.listDiscussThreads.mockRejectedValueOnce(new Error('backend unreachable'));
    render(<DiscussHistoryDrawer />);

    expect(await screen.findByRole('alert')).toHaveTextContent('backend unreachable');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Why did the migration fail?')).toBeInTheDocument();
    expect(mockedApi.listDiscussThreads).toHaveBeenCalledTimes(2);
  });

  it('refetches when refreshTick advances (e.g. after a fresh save)', async () => {
    const view = render(<DiscussHistoryDrawer refreshTick={0} />);
    await screen.findByText('Why did the migration fail?');
    expect(mockedApi.listDiscussThreads).toHaveBeenCalledTimes(1);

    view.rerender(<DiscussHistoryDrawer refreshTick={1} />);

    await waitFor(() => {
      expect(mockedApi.listDiscussThreads).toHaveBeenCalledTimes(2);
    });
  });

  it('closes via Escape from inside the drawer', async () => {
    const onClose = vi.fn();
    render(<DiscussHistoryDrawer onClose={onClose} />);
    await screen.findByText('Why did the migration fail?');

    fireEvent.keyDown(screen.getByRole('region', { name: 'Saved discussions' }), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers Continue in the expanded view and hands over the full thread', async () => {
    mockedApi.getDiscussThread.mockResolvedValue(detail);
    const onContinue = vi.fn();
    render(<DiscussHistoryDrawer onContinue={onContinue} />);

    // Collapsed rows offer no continue action.
    fireEvent.click(
      await screen.findByRole('button', { name: /^why did the migration fail\?/i }),
    );
    await screen.findByText('The lock table was stale.');

    fireEvent.click(
      screen.getByRole('button', { name: /continue discussion why did the migration fail/i }),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith(detail);
  });

  it('disables Continue with its reason while continuing is blocked', async () => {
    mockedApi.getDiscussThread.mockResolvedValue(detail);
    const onContinue = vi.fn();
    render(
      <DiscussHistoryDrawer
        onContinue={onContinue}
        continueBlockedReason="Wait for the reply to finish before continuing a saved discussion."
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /^why did the migration fail\?/i }),
    );

    const button = await screen.findByRole('button', {
      name: /continue discussion why did the migration fail/i,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'Wait for the reply to finish before continuing a saved discussion.',
    );
    // Disabled means disabled: clicking must not hand anything over.
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
