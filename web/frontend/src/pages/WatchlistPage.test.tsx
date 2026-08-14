import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WatchlistPage } from './WatchlistPage';
import { ApiError, type AgentWatchlistItem } from '../api';
import { copyToClipboard } from '../lib/clipboard';
import {
  downloadBlobFile,
  downloadMarkdownFile,
  downloadTextFile,
} from '../lib/downloadTextFile';

const baseItem: AgentWatchlistItem = {
  id: 'item-1',
  question: 'How is the Indian IPO market evolving?',
  interval_hours: 24,
  expertise_level: 'expert',
  expertise_domain: 'finance',
  last_run_at: '2026-07-18T10:00:00Z',
  next_run_at: '2026-07-19T10:00:00Z',
  latest_task_id: 'task-1',
  run_count: 3,
  is_active: true,
  created_at: '2026-07-10T00:00:00Z',
  latest_task: {
    task_id: 'task-1',
    title: 'IPO market mid-year recap',
    created_at: '2026-07-18T10:00:00Z',
    final_answer: 'IPO momentum is strong with stable retail participation.',
    final_score: 82,
    is_complete: true,
    is_shared: false,
    share_url: null,
  },
};

const pausedItem: AgentWatchlistItem = {
  ...baseItem,
  id: 'item-2',
  question: 'Will the monsoon affect Indian agriculture exports?',
  is_active: false,
  latest_task: null,
};

const tierState: {
  canUseFeature: ReturnType<typeof vi.fn>;
} = {
  canUseFeature: vi.fn().mockImplementation((feature: string) => {
    if (feature === 'agent_watchlist') return true;
    return false;
  }),
};

const navigateMock = vi.fn();
const getAgentWatchlistMock = vi.fn();
const patchAgentWatchlistBulkMock = vi.fn();
const patchAgentWatchlistMock = vi.fn();
const postAgentWatchlistRunMock = vi.fn();
const postAgentWatchlistDuplicateMock = vi.fn();
const getAgentWatchlistStatisticsMock = vi.fn();
const exportAgentWatchlistStatisticsCsvMock = vi.fn();
const exportAgentWatchlistHistoryJsonMock = vi.fn();
const exportAgentWatchlistHistoryCsvMock = vi.fn();
const getAgentWatchlistHistoryMock = vi.fn();
const createAgentTaskShareMock = vi.fn();

vi.mock('../context/TierContext', () => ({
  useTier: () => tierState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getAgentWatchlist: (...args: unknown[]) => getAgentWatchlistMock(...args),
    getAgentWatchlistStatistics: (...args: unknown[]) =>
      getAgentWatchlistStatisticsMock(...args),
    exportAgentWatchlistStatisticsCsv: (...args: unknown[]) =>
      exportAgentWatchlistStatisticsCsvMock(...args),
    exportAgentWatchlistHistoryJson: (...args: unknown[]) =>
      exportAgentWatchlistHistoryJsonMock(...args),
    exportAgentWatchlistHistoryCsv: (...args: unknown[]) =>
      exportAgentWatchlistHistoryCsvMock(...args),
    getAgentWatchlistHistory: (...args: unknown[]) =>
      getAgentWatchlistHistoryMock(...args),
    createAgentTaskShare: (...args: unknown[]) =>
      createAgentTaskShareMock(...args),
    patchAgentWatchlist: (...args: unknown[]) => patchAgentWatchlistMock(...args),
    postAgentWatchlistRun: (...args: unknown[]) => postAgentWatchlistRunMock(...args),
    postAgentWatchlistDuplicate: (...args: unknown[]) =>
      postAgentWatchlistDuplicateMock(...args),
    patchAgentWatchlistBulk: (...args: unknown[]) => patchAgentWatchlistBulkMock(...args),
    deleteAgentWatchlist: vi.fn().mockResolvedValue(undefined),
    ApiError: actual.ApiError,
  };
});

vi.mock('../utils/track', () => ({
  default: vi.fn(),
}));

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/downloadTextFile', async () => {
  const actual = await vi.importActual<typeof import('../lib/downloadTextFile')>(
    '../lib/downloadTextFile',
  );
  return {
    ...actual,
    downloadMarkdownFile: vi.fn().mockReturnValue(true),
    downloadTextFile: vi.fn().mockReturnValue(true),
    downloadBlobFile: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../components/KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: () => null,
}));

vi.mock('../components/HighlightQuery', () => ({
  HighlightQuery: ({ text }: { text: string }) => <>{text}</>,
}));

vi.mock('../components/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

vi.mock('../components/MicroLoader', () => ({
  default: () => <div data-testid="micro-loader" />,
}));

vi.mock('../components/MotionButton', () => ({
  MotionButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>,
  );
}

describe('WatchlistPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    // mockClear wipes call history but PRESERVES the mock
    // implementation. The 'blocks rendering when feature is gated'
    // test below swaps the implementation to () => false; without a
    // reset here, that swap would leak into the next test in the
    // file and the page would render the watchlist-gate instead of
    // the data, breaking the rest of the suite (the test runs in
    // arbitrary order, so this is a real flake, not a one-off).
    tierState.canUseFeature.mockReset();
    tierState.canUseFeature.mockImplementation((feature: string) => {
      if (feature === 'agent_watchlist') return true;
      return false;
    });
    getAgentWatchlistMock.mockReset();
    getAgentWatchlistMock.mockResolvedValue({
      items: [baseItem, pausedItem],
      active_count: 1,
      active_cap: 10,
      total: 2,
    });
    patchAgentWatchlistBulkMock.mockReset();
    patchAgentWatchlistBulkMock.mockResolvedValue({
      success: true,
      action: 'pause_all',
      applied: 1,
      skipped: 1,
      active_count: 0,
      paused_count: 2,
      active_cap: 10,
    });
    patchAgentWatchlistMock.mockReset();
    patchAgentWatchlistMock.mockImplementation(
      async (id: string, body?: Record<string, unknown>) => ({ ...baseItem, id, ...body }),
    );
    postAgentWatchlistRunMock.mockReset();
    postAgentWatchlistRunMock.mockResolvedValue({
      success: true,
      task_id: 'task-new',
      message: 'Watch re-check started',
      item: { ...baseItem, run_count: 4, latest_task_id: 'task-new' },
    });
    postAgentWatchlistDuplicateMock.mockReset();
    postAgentWatchlistDuplicateMock.mockResolvedValue({
      ...baseItem,
      id: 'item-1-copy',
      run_count: 0,
      latest_task_id: null,
      latest_task: null,
      is_active: false,
    });
    getAgentWatchlistStatisticsMock.mockReset();
    getAgentWatchlistStatisticsMock.mockResolvedValue({
      success: true,
      total_items: 2,
      active_items: 1,
      total_runs: 4,
      scored_runs: 3,
      avg_score: 82,
      min_score: 61,
      max_score: 95,
      success_rate: 75,
      per_item_stats: {},
    });
    exportAgentWatchlistStatisticsCsvMock.mockReset();
    exportAgentWatchlistStatisticsCsvMock.mockResolvedValue(
      new Blob(['summary'], { type: 'text/csv' }),
    );
    getAgentWatchlistHistoryMock.mockReset();
    getAgentWatchlistHistoryMock.mockResolvedValue({
      items: [
        {
          task_id: 'task-1',
          title: 'IPO market mid-year recap',
          final_score: 82,
          final_confidence: 0.72,
          user_feedback: null,
          created_at: '2026-07-18T10:00:00Z',
        },
      ],
      stats: {
        count: 1,
        scored_count: 1,
        avg_score: 82,
        min_score: 82,
        max_score: 82,
      },
    });
    exportAgentWatchlistHistoryJsonMock.mockReset();
    exportAgentWatchlistHistoryJsonMock.mockResolvedValue(
      new Blob(['{"success":true}'], { type: 'application/json' }),
    );
    exportAgentWatchlistHistoryCsvMock.mockReset();
    exportAgentWatchlistHistoryCsvMock.mockResolvedValue(
      new Blob(['task_id,question'], { type: 'text/csv' }),
    );
    createAgentTaskShareMock.mockReset();
    createAgentTaskShareMock.mockResolvedValue({
      shareToken: 'token-1',
      shareUrl: '/share/agent/token-1',
    });
    vi.mocked(copyToClipboard).mockClear();
    vi.mocked(downloadMarkdownFile).mockClear();
    vi.mocked(downloadTextFile).mockClear();
    vi.mocked(downloadBlobFile).mockClear();
  });

  it('renders the watchlist page chrome with BEM classes', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Watchlist')).toBeInTheDocument();
    });
    const main = screen.getByRole('main');
    expect(main).toHaveClass('watchlist-page__main');
    const header = screen.getByText('← Agent').parentElement;
    expect(header).toHaveClass('watchlist-page__header');
  });

  it('renders the status filter pill row with BEM classes', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-pill-row')).toBeTruthy();
    });
    const statusGroup = container.querySelector('[aria-label="Filter by status"]');
    expect(statusGroup).toBeTruthy();
    const pills = statusGroup!.querySelectorAll('.watchlist-pill');
    expect(pills.length).toBe(3);
    const activePill = statusGroup!.querySelector('.watchlist-pill--active');
    expect(activePill?.textContent).toBe('All');
  });

  it('marks the selected status pill with aria-pressed + the --active class', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-pill-row')).toBeTruthy();
    });
    const statusGroup = container.querySelector('[aria-label="Filter by status"]')!;
    const pausedPill = Array.from(
      statusGroup.querySelectorAll<HTMLButtonElement>('.watchlist-pill'),
    ).find((p) => p.textContent === 'Paused');
    expect(pausedPill).toBeTruthy();
    fireEvent.click(pausedPill!);
    expect(pausedPill!.getAttribute('aria-pressed')).toBe('true');
    expect(pausedPill!.className).toContain('watchlist-pill--active');
  });

  it('renders the sort select with the BEM class', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-page__sort-select')).toBeTruthy();
    });
    expect(
      container.querySelector('.watchlist-page__sort-select'),
    ).toHaveAttribute('aria-label', 'Sort watchlist');
  });

  it('renders the item card with BEM classes', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-item')).toBeTruthy();
    });
    const item = container.querySelector('.watchlist-item')!;
    expect(item.querySelector('.watchlist-item__badge-num')).toBeTruthy();
    expect(item.querySelector('.watchlist-item__title')).toBeTruthy();
    expect(item.querySelector('.watchlist-item__cadence-row')).toBeTruthy();
    expect(
      item.querySelector('.watchlist-item__cadence-row')!.getAttribute('role'),
    ).toBe('radiogroup');
  });

  it('renders the score chip with the right tonal class', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-score-chip')).toBeTruthy();
    });
    const chip = container.querySelector('.watchlist-score-chip')!;
    expect(chip.className).toContain('watchlist-score-chip--high');
    expect(chip.textContent).toBe('82/100');
  });

  it('renders the toggle and remove controls with the right classes', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-toggle')).toBeTruthy();
    });
    const toggle = container.querySelector('.watchlist-toggle')!;
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.className).toContain('watchlist-toggle--on');
    expect(container.querySelector('.watchlist-remove')).toBeTruthy();
  });

  it('shows the gate when the watchlist feature is unavailable', async () => {
    tierState.canUseFeature.mockImplementation(() => false);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.watchlist-gate')).toBeTruthy();
    });
    expect(container.querySelector('.watchlist-gate__title')?.textContent).toBe(
      'Watchlist',
    );
  });

  it('renders bulk pause and resume controls with live counts', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });
    expect(screen.getByText('Resume paused (1)')).toBeInTheDocument();
  });

  it('pauses all active watches through the bulk endpoint', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause all 1 active watch' }));
    await waitFor(() => {
      expect(patchAgentWatchlistBulkMock).toHaveBeenCalledWith('pause_all');
    });
    expect(await screen.findByText('Paused 1 active watch.')).toBeInTheDocument();
  });

  it('starts an immediate re-check through the run-now endpoint', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Run now: How is the Indian IPO market evolving?',
      }),
    );

    await waitFor(() => {
      expect(postAgentWatchlistRunMock).toHaveBeenCalledWith('item-1');
    });
    expect(
      await screen.findByText('Re-check started — the latest result will update shortly.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Run 4 times/)).toBeInTheDocument();
  });

  it('runs every active watch with one click and skips paused ones', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Run all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Run all 1 active watch now' }),
    );

    await waitFor(() => {
      expect(postAgentWatchlistRunMock).toHaveBeenCalledTimes(1);
    });
    expect(postAgentWatchlistRunMock).toHaveBeenCalledWith('item-1');
    expect(postAgentWatchlistRunMock).not.toHaveBeenCalledWith('item-2');
    expect(
      await screen.findByText('Started 1 re-check.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Run 4 times/)).toBeInTheDocument();
  });

  it('summarizes watches that are already re-checking', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        baseItem,
        { ...pausedItem, id: 'item-2', is_active: true },
      ],
      active_count: 2,
      active_cap: 10,
      total: 2,
    });
    postAgentWatchlistRunMock
      .mockRejectedValueOnce(
        new ApiError('Already re-checking', 409, {
          detail: {
            error: 'watchlist_run_in_progress',
            message: 'This watch is already re-checking; wait for the current run to finish.',
          },
        }),
      )
      .mockResolvedValue({
        success: true,
        task_id: 'task-new',
        message: 'Watch re-check started',
        item: {
          ...baseItem,
          id: 'item-2',
          run_count: 1,
          latest_task_id: 'task-new',
        },
      });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Run all (2)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Run all 2 active watches now' }),
    );

    expect(
      await screen.findByText(
        'Started 1 re-check. Skipped 1 (already re-checking).',
      ),
    ).toBeInTheDocument();
  });

  it('reports the rate-limit stop honestly when the burst is capped', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        baseItem,
        { ...pausedItem, id: 'item-2', is_active: true },
      ],
      active_count: 2,
      active_cap: 10,
      total: 2,
    });
    postAgentWatchlistRunMock.mockRejectedValue(
      new ApiError('Too many manual watchlist runs. Limit is 12 per hour.', 429),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Run all (2)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Run all 2 active watches now' }),
    );

    expect(
      await screen.findByText('Skipped 2 (rate or daily limit reached).'),
    ).toBeInTheDocument();
  });

  it('runs all active watches with Shift+R', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Run all (1)')).toBeInTheDocument();
    });

    const runAllButton = screen.getByRole('button', {
      name: 'Run all 1 active watch now',
    });
    expect(runAllButton).toHaveAttribute('aria-keyshortcuts', 'Shift+R');

    fireEvent.keyDown(window, { key: 'R', shiftKey: true });

    await waitFor(() => {
      expect(postAgentWatchlistRunMock).toHaveBeenCalledWith('item-1');
    });
    expect(
      await screen.findByText('Started 1 re-check.'),
    ).toBeInTheDocument();
  });

  it('ignores a second run-all click while the burst is in flight', async () => {
    let resolveRun:
      | ((value: {
          success: boolean;
          task_id: string;
          message: string;
          item: AgentWatchlistItem;
        }) => void)
      | undefined;
    postAgentWatchlistRunMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Run all (1)')).toBeInTheDocument();
    });

    const runAllButton = screen.getByRole('button', {
      name: 'Run all 1 active watch now',
    });
    fireEvent.click(runAllButton);
    fireEvent.click(runAllButton);

    await waitFor(() => {
      expect(postAgentWatchlistRunMock).toHaveBeenCalledTimes(1);
    });

    expect(resolveRun).toBeDefined();
    resolveRun?.({
      success: true,
      task_id: 'task-new',
      message: 'Watch re-check started',
      item: { ...baseItem, run_count: 4, latest_task_id: 'task-new' },
    });

    expect(
      await screen.findByText('Started 1 re-check.'),
    ).toBeInTheDocument();
  });

  it('opens a watched question in Arena for fresh four-mind takes', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ask in Arena: How is the Indian IPO market evolving?',
      }),
    );

    expect(navigateMock).toHaveBeenCalledWith('/app', {
      state: {
        agentStressPrompt: 'How is the Indian IPO market evolving?',
        fromWatchlist: true,
      },
    });
  });

  it('trims whitespace around a watched question before handing it to Arena', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        {
          ...baseItem,
          id: 'item-padded',
          question: '  How will AI shape hiring?  ',
        },
      ],
      active_count: 0,
      active_cap: 10,
      total: 1,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('How will AI shape hiring?')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByTitle('Open this watched question in Arena for fresh four-mind takes'),
    );

    expect(navigateMock).toHaveBeenCalledWith('/app', {
      state: {
        agentStressPrompt: 'How will AI shape hiring?',
        fromWatchlist: true,
      },
    });
  });

  it('does not open Arena when the watched question is blank', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [{ ...baseItem, id: 'item-blank', question: '   ' }],
      active_count: 0,
      active_cap: 10,
      total: 1,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Run 3 times/)).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByTitle('Open this watched question in Arena for fresh four-mind takes'),
    );

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shares the latest result from the card and copies the public link', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    const shareButton = screen.getByRole('button', {
      name: 'Share latest result: How is the Indian IPO market evolving?',
    });
    expect(shareButton).toHaveTextContent('Share result');

    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(createAgentTaskShareMock).toHaveBeenCalledWith('task-1');
    });
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    const copied = vi.mocked(copyToClipboard).mock.calls[0][0];
    expect(copied).toContain('/share/agent/token-1');
    expect(copied.startsWith('http')).toBe(true);
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('copies an already-shared latest result without publishing a new link', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        {
          ...baseItem,
          latest_task: {
            ...baseItem.latest_task!,
            is_shared: true,
            share_url: '/share/agent/existing',
          },
        },
        pausedItem,
      ],
      active_count: 1,
      active_cap: 10,
      total: 2,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Share latest result: How is the Indian IPO market evolving?',
      }),
    );

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    expect(createAgentTaskShareMock).not.toHaveBeenCalled();
    expect(vi.mocked(copyToClipboard).mock.calls[0][0]).toContain(
      '/share/agent/existing',
    );
  });

  it('copies the latest completed research answer from the card', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy latest result: How is the Indian IPO market evolving?',
      }),
    );

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    const markdown = vi.mocked(copyToClipboard).mock.calls[0][0];
    expect(markdown).toContain('# How is the Indian IPO market evolving?');
    expect(markdown).toContain('IPO market mid-year recap');
    expect(markdown).toContain('IPO momentum is strong');
    expect(markdown).toContain('82/100');
    expect(await screen.findByText('Result copied')).toBeInTheDocument();
  });

  it('hides the copy-result action when the latest task has no answer', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        {
          ...baseItem,
          latest_task: {
            ...baseItem.latest_task!,
            is_complete: false,
            final_answer: null,
          },
        },
      ],
      active_count: 1,
      active_cap: 10,
      total: 1,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', {
        name: 'Copy latest result: How is the Indian IPO market evolving?',
      }),
    ).not.toBeInTheDocument();
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('copies every completed latest result as one digest from the header', async () => {
    const secondCompleted: AgentWatchlistItem = {
      ...baseItem,
      id: 'item-2',
      question: 'Will rates cut this quarter?',
      latest_task: {
        task_id: 'task-2',
        title: 'Rates preview',
        created_at: '2026-07-19T08:00:00Z',
        final_answer: 'Markets price one cut, the desk leans toward two.',
        final_score: 76,
        is_complete: true,
        is_shared: false,
        share_url: null,
      },
    };
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        baseItem,
        secondCompleted,
        {
          ...pausedItem,
          latest_task: null,
        },
      ],
      active_count: 2,
      active_cap: 10,
      total: 3,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (2)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy all completed results as a markdown digest',
      }),
    );

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    const markdown = vi.mocked(copyToClipboard).mock.calls[0][0];
    expect(markdown).toContain('# Agent Watchlist — Results Digest');
    expect(markdown).toContain('**Active:** 2 / 10');
    expect(markdown).toContain('## 1. How is the Indian IPO market evolving?');
    expect(markdown).toContain('## 2. Will rates cut this quarter?');
    expect(markdown).toContain('Markets price one cut');
    expect(markdown).not.toContain('Will the monsoon affect');
    expect(await screen.findByText('Digest copied')).toBeInTheDocument();
  });

  it('refuses to copy a digest when no completed result exists in the view', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        {
          ...baseItem,
          latest_task: {
            ...baseItem.latest_task!,
            is_complete: false,
            final_answer: null,
          },
        },
      ],
      active_count: 1,
      active_cap: 10,
      total: 1,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy all completed results as a markdown digest',
      }),
    );

    expect(
      await screen.findByText(
        'No completed results in this view — a digest needs at least one finished answer.',
      ),
    ).toBeInTheDocument();
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('surfaces a share failure without disabling the card action permanently', async () => {
    createAgentTaskShareMock.mockRejectedValue(new Error('Share failed'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Share latest result: How is the Indian IPO market evolving?',
      }),
    );

    expect(
      await screen.findByText(
        'Could not share this result — open it in Agent and try again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Share latest result: How is the Indian IPO market evolving?',
      }),
    ).not.toBeDisabled();
  });

  it('does not offer to share an in-progress or failed latest result', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [
        {
          ...baseItem,
          latest_task: {
            ...baseItem.latest_task!,
            is_complete: false,
          },
        },
        pausedItem,
      ],
      active_count: 1,
      active_cap: 10,
      total: 2,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', {
        name: 'Share latest result: How is the Indian IPO market evolving?',
      }),
    ).not.toBeInTheDocument();
    expect(createAgentTaskShareMock).not.toHaveBeenCalled();
  });

  it('duplicates a watch as a paused copy through the duplicate endpoint', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Duplicate watch: How is the Indian IPO market evolving?',
      }),
    );

    await waitFor(() => {
      expect(postAgentWatchlistDuplicateMock).toHaveBeenCalledWith('item-1');
    });
    expect(
      await screen.findByText(
        'Duplicated watch — the paused copy is ready to edit or resume.',
      ),
    ).toBeInTheDocument();
    expect(getAgentWatchlistMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('How is the Indian IPO market evolving?')).toHaveLength(2);
  });

  it('reveals the paused copy when duplicating from the active-only filter', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => {
      expect(
        screen.queryByText('Will the monsoon affect Indian agriculture exports?'),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Duplicate watch: How is the Indian IPO market evolving?',
      }),
    );

    await waitFor(() => {
      expect(postAgentWatchlistDuplicateMock).toHaveBeenCalledWith('item-1');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.getAllByText('How is the Indian IPO market evolving?')).toHaveLength(2);
  });

  it('surfaces a duplicate failure without losing the current list', async () => {
    postAgentWatchlistDuplicateMock.mockRejectedValue(new Error('Duplicate failed'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Duplicate watch: How is the Indian IPO market evolving?',
      }),
    );

    expect(await screen.findByText('Could not duplicate this watch')).toBeInTheDocument();
    expect(screen.getAllByText('How is the Indian IPO market evolving?')).toHaveLength(1);
    expect(
      screen.getByRole('button', {
        name: 'Duplicate watch: How is the Indian IPO market evolving?',
      }),
    ).not.toBeDisabled();
  });

  it('opens the edit dialog prefilled with the watch question and expertise', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit watch: How is the Indian IPO market evolving?',
      }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit watch' });
    expect(dialog).toBeInTheDocument();
    const question = dialog.querySelector('#watchlist-edit-question') as HTMLTextAreaElement;
    expect(question.value).toBe('How is the Indian IPO market evolving?');
    const expertChip = dialog.querySelector(
      '.expertise-selector__chip[aria-checked="true"]',
    );
    expect(expertChip?.textContent).toBe('Expert');
    const domain = dialog.querySelector('.expertise-selector__domain-input') as HTMLInputElement;
    expect(domain.value).toBe('finance');
  });

  it('saves refined question and expertise through the patch endpoint', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit watch: How is the Indian IPO market evolving?',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit watch' });
    const question = dialog.querySelector('#watchlist-edit-question') as HTMLTextAreaElement;
    fireEvent.change(question, {
      target: { value: 'How are Indian IPOs evolving this quarter?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(patchAgentWatchlistMock).toHaveBeenCalledWith('item-1', {
        question: 'How are Indian IPOs evolving this quarter?',
        expertise_level: 'expert',
        expertise_domain: 'finance',
      });
    });
    expect(
      await screen.findByText('How are Indian IPOs evolving this quarter?'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit watch' })).not.toBeInTheDocument();
  });

  it('surfaces a save error in the edit dialog', async () => {
    patchAgentWatchlistMock.mockRejectedValue(new Error('Save failed'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit watch: How is the Indian IPO market evolving?',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit watch' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Could not save changes')).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it('locks background scroll and restores focus when the edit dialog closes', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', {
      name: 'Edit watch: How is the Indian IPO market evolving?',
    });
    fireEvent.click(editButton);

    const dialog = await screen.findByRole('dialog', { name: 'Edit watch' });
    expect(dialog).toHaveAttribute('aria-describedby', 'watchlist-edit-hint');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit watch' })).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('');
    expect(editButton).toHaveFocus();
  });

  it('downloads the current filtered view as CSV', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Download watchlist as CSV' }),
    );

    const { downloadTextFile } = await import('../lib/downloadTextFile');
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [csv, opts] = vi.mocked(downloadTextFile).mock.calls[0];
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"question","status","cadenceHours"');
    expect(csv).toContain(
      '\r\n"How is the Indian IPO market evolving?","active","24","3"',
    );
    expect(csv).toContain(
      '\r\n"Will the monsoon affect Indian agriculture exports?","paused","24","3"',
    );
    expect(opts.filename).toMatch(/^agent-watchlist-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(opts.mimeType).toBe('text/csv;charset=utf-8');
  });

  it('downloads the current filtered view as JSON', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => {
      expect(
        screen.queryByText('Will the monsoon affect Indian agriculture exports?'),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Download watchlist as JSON' }),
    );

    const { downloadTextFile } = await import('../lib/downloadTextFile');
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [json, opts] = vi.mocked(downloadTextFile).mock.calls[0];
    const parsed = JSON.parse(json as string) as {
      exported_from: string;
      active_count: number;
      active_cap: number;
      filter_note: string;
      count: number;
      items: Array<{ question: string; status: string; latest_score: number | null }>;
    };
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.active_count).toBe(1);
    expect(parsed.active_cap).toBe(10);
    expect(parsed.filter_note).toBe('status: active');
    expect(parsed.count).toBe(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].question).toBe('How is the Indian IPO market evolving?');
    expect(parsed.items[0].status).toBe('active');
    expect(parsed.items[0].latest_score).toBe(82);
    expect(opts.filename).toMatch(/^agent-watchlist-\d{4}-\d{2}-\d{2}\.json$/);
    expect(opts.mimeType).toBe('application/json;charset=utf-8');
  });

  it('surfaces a JSON download failure and marks the button as failed', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Download watchlist as JSON' }),
    );

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Could not download watchlist JSON — try again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'JSON download failed' }),
    ).toBeInTheDocument();
  });

  it('copies the current watchlist as markdown with Shift+C', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    const markdown = vi.mocked(copyToClipboard).mock.calls[0][0];
    expect(markdown).toContain('# Agent Watchlist');
    expect(markdown).toContain('How is the Indian IPO market evolving?');
    expect(markdown).toContain('Will the monsoon affect Indian agriculture exports?');
  });

  it('downloads the current watchlist as markdown with Shift+D', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'D', shiftKey: true });

    expect(downloadMarkdownFile).toHaveBeenCalledTimes(1);
    const [markdown] = vi.mocked(downloadMarkdownFile).mock.calls[0];
    expect(markdown).toContain('# Agent Watchlist');
  });

  it('downloads the current watchlist as CSV with Shift+E', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    const csvButton = screen.getByRole('button', { name: 'Download watchlist as CSV' });
    expect(csvButton).toHaveAttribute('aria-keyshortcuts', 'Shift+E');

    fireEvent.keyDown(window, { key: 'E', shiftKey: true });

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [csv] = vi.mocked(downloadTextFile).mock.calls[0];
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"question","status","cadenceHours"');
  });

  it('downloads the current watchlist as JSON with Shift+J', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    const jsonButton = screen.getByRole('button', { name: 'Download watchlist as JSON' });
    expect(jsonButton).toHaveAttribute('aria-keyshortcuts', 'Shift+J');

    fireEvent.keyDown(window, { key: 'J', shiftKey: true });

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [json] = vi.mocked(downloadTextFile).mock.calls[0];
    const parsed = JSON.parse(json as string) as { items: Array<{ question: string }> };
    expect(parsed.items[0].question).toBe('How is the Indian IPO market evolving?');
    expect(parsed.items[1].question).toBe('Will the monsoon affect Indian agriculture exports?');
  });

  it('copies the current filtered view as JSON', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => {
      expect(
        screen.queryByText('Will the monsoon affect Indian agriculture exports?'),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy watchlist as JSON' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    const json = vi.mocked(copyToClipboard).mock.calls[0][0];
    const parsed = JSON.parse(json as string) as {
      exported_from: string;
      active_count: number;
      active_cap: number;
      filter_note: string;
      count: number;
      items: Array<{ question: string; status: string; latest_score: number | null }>;
    };
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.active_count).toBe(1);
    expect(parsed.active_cap).toBe(10);
    expect(parsed.filter_note).toBe('status: active');
    expect(parsed.count).toBe(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].question).toBe('How is the Indian IPO market evolving?');
    expect(parsed.items[0].status).toBe('active');
    expect(parsed.items[0].latest_score).toBe(82);
    expect(
      await screen.findByRole('button', { name: 'Watchlist JSON copied' }),
    ).toBeInTheDocument();
  });

  it('copies the current watchlist as JSON with Shift+O', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    const jsonCopyButton = screen.getByRole('button', { name: 'Copy watchlist as JSON' });
    expect(jsonCopyButton).toHaveAttribute('aria-keyshortcuts', 'Shift+O');

    fireEvent.keyDown(window, { key: 'O', shiftKey: true });

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    const json = vi.mocked(copyToClipboard).mock.calls[0][0];
    const parsed = JSON.parse(json as string) as {
      exported_from: string;
      count: number;
      items: Array<{ question: string }>;
    };
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.count).toBe(2);
    expect(parsed.items[0].question).toBe('How is the Indian IPO market evolving?');
    expect(parsed.items[1].question).toBe('Will the monsoon affect Indian agriculture exports?');
  });

  it('surfaces a JSON copy failure and marks the button as failed', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Copy watchlist as JSON' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText('Could not copy watchlist JSON — try Download .json instead.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON copy failed' })).toBeInTheDocument();
  });

  it('dedupes repeated Shift+O JSON copies while one is in flight', async () => {
    const { unmount } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    let resolveCopy!: (value: boolean) => void;
    vi.mocked(copyToClipboard).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveCopy = resolve;
      }),
    );

    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });

    expect(copyToClipboard).toHaveBeenCalledTimes(1);

    resolveCopy(true);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Watchlist JSON copied' }),
      ).toBeInTheDocument();
    });
    unmount();
  });

  it('downloads watchlist statistics as CSV with Shift+F', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Watchlist overview statistics')).toBeInTheDocument();
    });

    const statsButton = screen.getByRole('button', {
      name: 'Download watchlist statistics as CSV',
    });
    expect(statsButton).toHaveAttribute('aria-keyshortcuts', 'Shift+F');

    fireEvent.keyDown(window, { key: 'F', shiftKey: true });

    await waitFor(() => {
      expect(exportAgentWatchlistStatisticsCsvMock).toHaveBeenCalledTimes(1);
    });
    expect(downloadBlobFile).toHaveBeenCalledTimes(1);
  });

  it('ignores export shortcuts while the watchlist is still loading', async () => {
    let resolveLoad!: (value: {
      items: AgentWatchlistItem[];
      active_count: number;
      active_cap: number;
      total: number;
    }) => void;
    getAgentWatchlistMock.mockReturnValue(
      new Promise<{
        items: AgentWatchlistItem[];
        active_count: number;
        active_cap: number;
        total: number;
      }>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const { unmount } = renderPage();

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    fireEvent.keyDown(window, { key: 'E', shiftKey: true });
    fireEvent.keyDown(window, { key: 'J', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    fireEvent.keyDown(window, { key: 'F', shiftKey: true });

    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(downloadMarkdownFile).not.toHaveBeenCalled();
    expect(downloadTextFile).not.toHaveBeenCalled();
    expect(exportAgentWatchlistStatisticsCsvMock).not.toHaveBeenCalled();

    resolveLoad({
      items: [baseItem, pausedItem],
      active_count: 1,
      active_cap: 10,
      total: 2,
    });
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });
    unmount();
  });

  it('ignores export shortcuts while there are no watched tasks', async () => {
    getAgentWatchlistMock.mockResolvedValue({
      items: [],
      active_count: 0,
      active_cap: 10,
      total: 0,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No watched tasks yet')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    fireEvent.keyDown(window, { key: 'E', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    fireEvent.keyDown(window, { key: 'F', shiftKey: true });

    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(downloadMarkdownFile).not.toHaveBeenCalled();
    expect(downloadTextFile).not.toHaveBeenCalled();
    expect(exportAgentWatchlistStatisticsCsvMock).not.toHaveBeenCalled();
  });

  it('does not download statistics with Shift+F before the stats strip is visible', async () => {
    getAgentWatchlistStatisticsMock.mockRejectedValue(new Error('stats not ready'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Watchlist overview statistics')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'F', shiftKey: true });

    expect(exportAgentWatchlistStatisticsCsvMock).not.toHaveBeenCalled();
  });

  it('ignores export shortcuts while the edit dialog is open', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit watch: How is the Indian IPO market evolving?',
      }),
    );
    await screen.findByRole('dialog', { name: 'Edit watch' });

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });

    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('dedupes repeated Shift+F exports while a stats download is in flight', async () => {
    let resolveStats!: (blob: Blob) => void;
    exportAgentWatchlistStatisticsCsvMock.mockReturnValue(
      new Promise<Blob>((resolve) => {
        resolveStats = resolve;
      }),
    );
    const { unmount } = renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Watchlist overview statistics')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'F', shiftKey: true });
    fireEvent.keyDown(window, { key: 'F', shiftKey: true });

    expect(exportAgentWatchlistStatisticsCsvMock).toHaveBeenCalledTimes(1);
    resolveStats(new Blob(['summary'], { type: 'text/csv' }));
    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledTimes(1);
    });
    unmount();
  });

  it('renders the overview stats strip and downloads full statistics CSV', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Watchlist overview statistics')).toBeInTheDocument();
    });
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Research runs')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Download watchlist statistics as CSV' }),
    );

    await waitFor(() => {
      expect(exportAgentWatchlistStatisticsCsvMock).toHaveBeenCalledTimes(1);
    });
    const { downloadBlobFile } = await import('../lib/downloadTextFile');
    expect(downloadBlobFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadBlobFile).mock.calls[0][1]).toMatch(
      /^arena-watchlist-stats-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });

  it('downloads run history as JSON from the history panel', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '.json' }));
    await waitFor(() => {
      expect(exportAgentWatchlistHistoryJsonMock).toHaveBeenCalledWith('item-1', 100);
    });

    const { downloadBlobFile } = await import('../lib/downloadTextFile');
    const calls = vi.mocked(downloadBlobFile).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][1]).toMatch(/^watch-history-.*\.json$/);
  });

  it('downloads run history as CSV from the history panel', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download run history as CSV' }));
    await waitFor(() => {
      expect(exportAgentWatchlistHistoryCsvMock).toHaveBeenCalledWith('item-1', 100);
    });

    const { downloadBlobFile } = await import('../lib/downloadTextFile');
    const calls = vi.mocked(downloadBlobFile).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][1]).toMatch(/^watch-history-.*\.csv$/);
  });

  it('expands a run answer inline and copies it from the history panel', async () => {
    getAgentWatchlistHistoryMock.mockResolvedValue({
      items: [
        {
          task_id: 'task-1',
          title: 'IPO market mid-year recap',
          final_answer: 'The IPO pipeline remains strong, with three large listings expected.',
          final_score: 82,
          final_confidence: 0.72,
          user_feedback: null,
          created_at: '2026-07-18T10:00:00Z',
        },
      ],
      stats: {
        count: 1,
        scored_count: 1,
        avg_score: 82,
        min_score: 82,
        max_score: 82,
      },
      total: 1,
      has_more: false,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    const toggle = screen.getByRole('button', {
      name: 'View answer for IPO market mid-year recap',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(
      screen.getByText(
        'The IPO pipeline remains strong, with three large listings expected.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hide answer for IPO market mid-year recap' }),
    ).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Copy this run answer' }));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(
        'The IPO pipeline remains strong, with three large listings expected.',
      );
    });
    expect(screen.getByRole('button', { name: 'Answer copied' })).toBeInTheDocument();
  });

  it('hides a run answer and opens the full report from the history panel', async () => {
    getAgentWatchlistHistoryMock.mockResolvedValue({
      items: [
        {
          task_id: 'task-1',
          title: 'IPO market mid-year recap',
          final_answer: 'A concise answer to read inline.',
          final_score: 82,
          final_confidence: 0.72,
          user_feedback: null,
          created_at: '2026-07-18T10:00:00Z',
        },
      ],
      stats: {
        count: 1,
        scored_count: 1,
        avg_score: 82,
        min_score: 82,
        max_score: 82,
      },
      total: 1,
      has_more: false,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'View answer for IPO market mid-year recap' }),
    );
    expect(screen.getByText('A concise answer to read inline.')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide answer for IPO market mid-year recap' }),
    );
    expect(screen.queryByText('A concise answer to read inline.')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'View answer for IPO market mid-year recap' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open full report' }));
    expect(navigateMock).toHaveBeenCalledWith('/agent?task_id=task-1');
  });

  it('does not show an answer toggle when a run has no final answer', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /View answer for/ }),
    ).not.toBeInTheDocument();
  });

  it('flattens structured run answers for inline reading and copying', async () => {
    getAgentWatchlistHistoryMock.mockResolvedValue({
      items: [
        {
          task_id: 'task-1',
          title: 'IPO market mid-year recap',
          final_answer: JSON.stringify({
            sentences: [
              { text: 'First paragraph.', confidence: 'supported', type: 'fact' },
              { text: '## Bottom line\nSecond paragraph.', confidence: 'verified' },
            ],
          }),
          final_score: 82,
          final_confidence: 0.72,
          user_feedback: null,
          created_at: '2026-07-18T10:00:00Z',
        },
      ],
      stats: {
        count: 1,
        scored_count: 1,
        avg_score: 82,
        min_score: 82,
        max_score: 82,
      },
      total: 1,
      has_more: false,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'View answer for IPO market mid-year recap' }),
    );
    expect(screen.getByText(/First paragraph\./)).toBeInTheDocument();
    expect(screen.getByText(/## Bottom line/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy this run answer' }));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(
        'First paragraph.\n\n## Bottom line\nSecond paragraph.',
      );
    });
  });

  it('hides the answer toggle when a run only has an empty JSON payload', async () => {
    getAgentWatchlistHistoryMock.mockResolvedValue({
      items: [
        {
          task_id: 'task-1',
          title: 'IPO market mid-year recap',
          final_answer: '{}',
          final_score: 82,
          final_confidence: 0.72,
          user_feedback: null,
          created_at: '2026-07-18T10:00:00Z',
        },
      ],
      stats: {
        count: 1,
        scored_count: 1,
        avg_score: 82,
        min_score: 82,
        max_score: 82,
      },
      total: 1,
      has_more: false,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /View answer for/ }),
    ).not.toBeInTheDocument();
  });

  it('loads older runs from the history panel with pagination', async () => {
    getAgentWatchlistHistoryMock
      .mockResolvedValueOnce({
        items: [
          {
            task_id: 'task-1',
            title: 'IPO market mid-year recap',
            final_score: 82,
            final_confidence: 0.72,
            user_feedback: null,
            created_at: '2026-07-18T10:00:00Z',
          },
          {
            task_id: 'task-2',
            title: 'Earlier IPO recap',
            final_score: 71,
            final_confidence: 0.61,
            user_feedback: null,
            created_at: '2026-07-10T10:00:00Z',
          },
        ],
        stats: {
          count: 3,
          scored_count: 3,
          avg_score: 72.3,
          min_score: 64,
          max_score: 82,
        },
        total: 3,
        has_more: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            task_id: 'task-3',
            title: 'Oldest IPO recap',
            final_score: 64,
            final_confidence: 0.55,
            user_feedback: null,
            created_at: '2026-07-01T10:00:00Z',
          },
        ],
        stats: {
          count: 3,
          scored_count: 3,
          avg_score: 72.3,
          min_score: 64,
          max_score: 82,
        },
        total: 3,
        has_more: false,
      });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });
    expect(screen.getByText('Earlier IPO recap')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load older runs (1 more)' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load older runs (1 more)' }));
    await waitFor(() => {
      expect(screen.getByText('Oldest IPO recap')).toBeInTheDocument();
    });

    expect(getAgentWatchlistHistoryMock).toHaveBeenNthCalledWith(1, 'item-1', 30);
    expect(getAgentWatchlistHistoryMock).toHaveBeenNthCalledWith(
      2,
      'item-1',
      50,
      2,
      'task-2',
    );
    expect(
      screen.queryByRole('button', { name: 'Load older runs (1 more)' }),
    ).not.toBeInTheDocument();
  });

  it('deduplicates overlapping load-more rows instead of repeating runs', async () => {
    getAgentWatchlistHistoryMock
      .mockResolvedValueOnce({
        items: [
          {
            task_id: 'task-1',
            title: 'IPO market mid-year recap',
            final_score: 82,
            final_confidence: 0.72,
            user_feedback: null,
            created_at: '2026-07-18T10:00:00Z',
          },
          {
            task_id: 'task-2',
            title: 'Earlier IPO recap',
            final_score: 71,
            final_confidence: 0.61,
            user_feedback: null,
            created_at: '2026-07-10T10:00:00Z',
          },
        ],
        stats: {
          count: 3,
          scored_count: 3,
          avg_score: 72.3,
          min_score: 64,
          max_score: 82,
        },
        total: 3,
        has_more: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            task_id: 'task-2',
            title: 'Earlier IPO recap',
            final_score: 71,
            final_confidence: 0.61,
            user_feedback: null,
            created_at: '2026-07-10T10:00:00Z',
          },
          {
            task_id: 'task-3',
            title: 'Oldest IPO recap',
            final_score: 64,
            final_confidence: 0.55,
            user_feedback: null,
            created_at: '2026-07-01T10:00:00Z',
          },
        ],
        stats: {
          count: 3,
          scored_count: 3,
          avg_score: 72.3,
          min_score: 64,
          max_score: 82,
        },
        total: 3,
        has_more: false,
      });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load older runs (1 more)' }));
    await waitFor(() => {
      expect(screen.getByText('Oldest IPO recap')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Earlier IPO recap')).toHaveLength(1);
  });

  it('keeps loaded runs and allows retry when loading older runs fails', async () => {
    getAgentWatchlistHistoryMock
      .mockResolvedValueOnce({
        items: [
          {
            task_id: 'task-1',
            title: 'IPO market mid-year recap',
            final_score: 82,
            final_confidence: 0.72,
            user_feedback: null,
            created_at: '2026-07-18T10:00:00Z',
          },
          {
            task_id: 'task-2',
            title: 'Earlier IPO recap',
            final_score: 71,
            final_confidence: 0.61,
            user_feedback: null,
            created_at: '2026-07-10T10:00:00Z',
          },
        ],
        stats: {
          count: 3,
          scored_count: 3,
          avg_score: 72.3,
          min_score: 64,
          max_score: 82,
        },
        total: 3,
        has_more: true,
      })
      .mockRejectedValueOnce(new ApiError('History exploded', 500))
      .mockResolvedValueOnce({
        items: [
          {
            task_id: 'task-3',
            title: 'Oldest IPO recap',
            final_score: 64,
            final_confidence: 0.55,
            user_feedback: null,
            created_at: '2026-07-01T10:00:00Z',
          },
        ],
        stats: {
          count: 3,
          scored_count: 3,
          avg_score: 72.3,
          min_score: 64,
          max_score: 82,
        },
        total: 3,
        has_more: false,
      });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pause all (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Run history' })[0]);
    await waitFor(() => {
      expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load older runs (1 more)' }));
    await waitFor(() => {
      expect(screen.getByText('History exploded')).toBeInTheDocument();
    });
    expect(screen.getByText('IPO market mid-year recap')).toBeInTheDocument();
    expect(screen.getByText('Earlier IPO recap')).toBeInTheDocument();

    // The button returns to an enabled state so the user can retry.
    const retryButton = screen.getByRole('button', {
      name: 'Load older runs (1 more)',
    });
    expect(retryButton).not.toBeDisabled();
    fireEvent.click(retryButton);
    await waitFor(() => {
      expect(screen.getByText('Oldest IPO recap')).toBeInTheDocument();
    });
    expect(screen.queryByText('History exploded')).not.toBeInTheDocument();
  });
});
