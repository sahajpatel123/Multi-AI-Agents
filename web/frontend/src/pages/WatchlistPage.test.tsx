import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WatchlistPage } from './WatchlistPage';
import type { AgentWatchlistItem } from '../api';
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
    final_score: 82,
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
const getAgentWatchlistHistoryMock = vi.fn();

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
    getAgentWatchlistHistory: (...args: unknown[]) =>
      getAgentWatchlistHistoryMock(...args),
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
      state: { agentStressPrompt: 'How is the Indian IPO market evolving?' },
    });
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
});
