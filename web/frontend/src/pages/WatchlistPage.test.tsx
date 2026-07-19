import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WatchlistPage } from './WatchlistPage';
import type { AgentWatchlistItem } from '../api';

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
    getAgentWatchlistHistory: vi.fn().mockResolvedValue({
      items: [],
      stats: {
        run_count: 0,
        avg_score: null,
        best_score: null,
        worst_score: null,
        last_run_at: null,
      },
    }),
    patchAgentWatchlist: vi.fn().mockImplementation(async (id: string) => {
      return { ...baseItem, id };
    }),
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

vi.mock('../lib/downloadTextFile', () => ({
  downloadMarkdownFile: vi.fn().mockReturnValue(true),
}));

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
    tierState.canUseFeature.mockClear();
    getAgentWatchlistMock.mockReset();
    getAgentWatchlistMock.mockResolvedValue({
      items: [baseItem],
      active_count: 1,
      active_cap: 10,
    });
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
});
