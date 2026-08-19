import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileModal } from './ProfileModal';
import { ProfileModalProvider, useProfileModal } from '../context/ProfileModalContext';
import { downloadBlobFile } from '../lib/downloadTextFile';

const navigateMock = vi.fn();
const refreshUserMock = vi.fn().mockResolvedValue(undefined);
const refreshTierMock = vi.fn().mockResolvedValue(undefined);

const authState = {
  isAuthenticated: true,
  user: {
    id: 'user-1',
    email: 'sahaj@example.com',
    name: 'Sahaj Patel',
    full_name: 'Sahaj Patel',
    tier: 'PLUS',
    expertise_level: 'expert',
    expertise_domain: 'finance',
    agent_addon_active: false,
    agent_addon_cancelling: false,
  },
  refreshUser: refreshUserMock,
};

const tierState = {
  tier: 'PLUS',
  canUseFeature: vi.fn().mockReturnValue(true),
  refreshTier: refreshTierMock,
};

const hoistedMocks = vi.hoisted(() => {
  const personaWinRateMarkdownBlob = new Blob(['# Arena — persona win rates'], {
    type: 'text/markdown',
  });
  Object.defineProperty(personaWinRateMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — persona win rates'),
  });
  const feedbackSummaryMarkdownBlob = new Blob(['# Arena — feedback activity\n'], {
    type: 'text/markdown',
  });
  Object.defineProperty(feedbackSummaryMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — feedback activity\n'),
  });
  const calibrationMarkdownBlob = new Blob(['# Arena — confidence calibration'], {
    type: 'text/markdown',
  });
  Object.defineProperty(calibrationMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — confidence calibration'),
  });
  const categoryStatsMarkdownBlob = new Blob(['# Arena — category stats'], {
    type: 'text/markdown',
  });
  Object.defineProperty(categoryStatsMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — category stats'),
  });
  const activityMarkdownBlob = new Blob(['# Arena — activity timeline'], {
    type: 'text/markdown',
  });
  Object.defineProperty(activityMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — activity timeline'),
  });
  const summaryMarkdownBlob = new Blob(['# Arena — analytics summary'], {
    type: 'text/markdown',
  });
  Object.defineProperty(summaryMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — analytics summary'),
  });
  const summaryCsvBlob = new Blob(['metric,value\ntotal_prompts,42\n'], {
    type: 'text/csv',
  });
  Object.defineProperty(summaryCsvBlob, 'text', {
    value: vi.fn().mockResolvedValue('metric,value\ntotal_prompts,42\n'),
  });
  const summaryJsonBlob = new Blob(['{"window_days":30,"total_prompts":42}'], {
    type: 'application/json',
  });
  Object.defineProperty(summaryJsonBlob, 'text', {
    value: vi.fn().mockResolvedValue('{"window_days":30,"total_prompts":42}'),
  });
  const usageMarkdownBlob = new Blob(['# Arena — usage report'], {
    type: 'text/markdown',
  });
  Object.defineProperty(usageMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — usage report'),
  });

  return {
  calibrationMarkdownBlob,
  categoryStatsMarkdownBlob,
  activityMarkdownBlob,
  summaryMarkdownBlob,
  summaryCsvBlob,
  summaryJsonBlob,
  usageMarkdownBlob,
  getSubscriptionStatus: vi.fn().mockResolvedValue({
    active: true,
    status: 'active',
    amount: 99900,
    current_end: '2026-08-19T00:00:00Z',
    billing_period: 'monthly',
    has_subscription: true,
    plan: 'plus',
  }),
  getUserUsage: vi.fn().mockResolvedValue({
    credits_used_today: 0,
    credits_remaining_today: 0,
    daily_limit: 0,
    credits_used_week: 0,
    credits_remaining_week: 0,
    weekly_limit: 0,
    total_tasks_month: 0,
    usage_history: [],
  }),
  getAnalyticsActivity: vi.fn().mockResolvedValue({
    window_days: 30,
    start_date: '2026-07-13',
    end_date: '2026-08-11',
    activity: [],
    totals: { prompts: 42, debates: 3, discusses: 5, agent_runs: 7 },
    active_days: 9,
    current_streak: 2,
    longest_streak: 6,
    busiest_day: '2026-08-10',
    busiest_day_count: 8,
  }),
  getAnalyticsCategoryStats: vi.fn().mockResolvedValue({
    window_days: 30,
    window_start: '2026-07-13',
    window_end: '2026-08-11',
    total_appearances: 10,
    total_wins: 7,
    most_active_category: 'question',
    categories: [
      {
        category: 'question',
        is_known_category: true,
        is_uncategorized: false,
        appearances: 6,
        wins: 5,
        win_rate: 0.8333,
        avg_winning_score: 88,
        last_exchange_at: '2026-08-11T10:00:00',
        best_persona_id: 'analyst',
      },
      {
        category: 'task',
        is_known_category: true,
        is_uncategorized: false,
        appearances: 4,
        wins: 2,
        win_rate: 0.5,
        avg_winning_score: 79,
        last_exchange_at: '2026-08-10T10:00:00',
        best_persona_id: 'philosopher',
      },
    ],
  }),
  exportAnalyticsActivityCsv: vi.fn().mockResolvedValue(
    new Blob(['date,prompts'], { type: 'text/csv' }),
  ),
  exportAnalyticsActivityJson: vi.fn().mockResolvedValue({
    blob: new Blob(['{"activity":[]}'], { type: 'application/json' }),
    filename: 'arena-activity-2026-08-05-to-2026-08-11.json',
  }),
  exportAnalyticsActivityMarkdown: vi.fn().mockResolvedValue({
    blob: activityMarkdownBlob,
    filename: 'arena-activity-2026-08-05-to-2026-08-11.md',
  }),
  exportAnalyticsCategoryStatsCsv: vi.fn().mockResolvedValue(
    new Blob(['category,appearances,wins'], { type: 'text/csv' }),
  ),
  exportAnalyticsCategoryStatsJson: vi.fn().mockResolvedValue({
    blob: new Blob(['{"categories":[]}'], { type: 'application/json' }),
    filename: 'arena-category-stats-2026-08-05-to-2026-08-11.json',
  }),
  exportAnalyticsCategoryStatsMarkdown: vi.fn().mockResolvedValue({
    blob: categoryStatsMarkdownBlob,
    filename: 'arena-category-stats-2026-08-05-to-2026-08-11.md',
  }),
  exportAnalyticsSummaryCsv: vi.fn().mockResolvedValue(summaryCsvBlob),
  exportAnalyticsSummaryJson: vi.fn().mockResolvedValue({
    blob: summaryJsonBlob,
    filename: 'arena-summary-2026-07-13-to-2026-08-11.json',
  }),
  exportAnalyticsSummaryMarkdown: vi.fn().mockResolvedValue({
    blob: summaryMarkdownBlob,
    filename: 'arena-summary-2026-07-13-to-2026-08-11.md',
  }),
  exportUserUsageCsv: vi.fn((windowDays: number = 14) => Promise.resolve({
    blob: new Blob(['date,tokens'], { type: 'text/csv' }),
    filename: `arena-usage-${windowDays}d.csv`,
  })),
  exportUserUsageJson: vi.fn((windowDays: number = 14) => Promise.resolve({
    blob: new Blob(['{"history":[]}'], { type: 'application/json' }),
    filename: windowDays === 14
      ? 'arena-usage-2026-07-29-to-2026-08-11.json'
      : `arena-usage-${windowDays}d.json`,
  })),
  exportUserUsageMarkdown: vi.fn().mockResolvedValue({
    blob: usageMarkdownBlob,
    filename: 'arena-usage-2026-07-29-to-2026-08-11.md',
  }),
  getAnalyticsPersonaWinRate: vi.fn().mockResolvedValue({
    window_days: 30,
    window_start: '2026-07-13',
    window_end: '2026-08-11',
    min_appearances: 1,
    include_fallback: false,
    low_confidence_threshold: 5,
    scored_exchanges: 10,
    unattributed_exchanges: 0,
    fallback_exchanges: 0,
    personas: [
      {
        persona_id: 'analyst',
        name: 'The Analyst',
        color: '#F0B84E',
        appearances: 8,
        wins: 6,
        win_rate: 0.75,
        low_confidence: false,
        trend_omitted_appearances: 0,
        trend_omitted_wins: 0,
        trend: [
          { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 2, wins: 1, win_rate: 0.5 },
          { bucket_start: '2026-07-20', bucket_end: '2026-07-26', appearances: 1, wins: 1, win_rate: 1 },
          { bucket_start: '2026-07-27', bucket_end: '2026-08-02', appearances: 2, wins: 2, win_rate: 1 },
          { bucket_start: '2026-08-03', bucket_end: '2026-08-09', appearances: 2, wins: 1, win_rate: 0.5 },
          { bucket_start: '2026-08-10', bucket_end: '2026-08-11', appearances: 1, wins: 1, win_rate: 1 },
        ],
      },
      {
        persona_id: 'philosopher',
        name: 'The Philosopher',
        color: '#8C7355',
        appearances: 3,
        wins: 2,
        win_rate: 0.667,
        low_confidence: true,
        trend_omitted_appearances: 0,
        trend_omitted_wins: 0,
        trend: [
          { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 2, wins: 1, win_rate: 0.5 },
          { bucket_start: '2026-07-20', bucket_end: '2026-07-26', appearances: 0, wins: 0, win_rate: null },
          { bucket_start: '2026-07-27', bucket_end: '2026-08-02', appearances: 1, wins: 1, win_rate: 1 },
        ],
      },
    ],
    best_persona_id: 'analyst',
    best_win_rate: 0.75,
  }),
  exportAnalyticsPersonaWinRateCsv: vi.fn().mockResolvedValue({
    blob: new Blob(['persona_id,name'], { type: 'text/csv' }),
    filename: 'arena-persona-win-rate-2026-07-13-to-2026-08-11.csv',
  }),
  exportAnalyticsPersonaWinRateJson: vi.fn().mockResolvedValue({
    blob: new Blob(['{"window_days":30,"personas":[]}'], { type: 'application/json' }),
    filename: 'arena-persona-win-rate-2026-07-13-to-2026-08-11.json',
  }),
  exportAnalyticsPersonaWinRateMarkdown: vi.fn().mockResolvedValue({
    blob: personaWinRateMarkdownBlob,
    filename: 'arena-persona-win-rate-2026-07-13-to-2026-08-11.md',
  }),
  copyToClipboard: vi.fn().mockResolvedValue(true),
  copyCsvToClipboard: vi.fn().mockResolvedValue(true),
  copyMarkdownToClipboard: vi.fn().mockResolvedValue(true),
  getCalibrationHistory: vi.fn().mockResolvedValue({
    ratings: [],
    total: 0,
    page: 1,
    per_page: 5,
    total_pages: 0,
    filters: { min_delta: null, max_delta: null, sort: 'newest' },
  }),
  getCalibrationStats: vi.fn().mockResolvedValue({
    score: null,
    coverage: 0,
    avg_gap: null,
  }),
  getRecentAgentFeedback: vi.fn().mockResolvedValue([]),
  getAgentFeedbackSummary: vi.fn().mockResolvedValue({
    total: 4,
    verdicts: { correct: 2, partial: 1, wrong: 1 },
    rate: 0.5,
    window_days: 30,
    daily_trend: Array.from({ length: 30 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      count: index === 29 ? 2 : index === 28 ? 1 : 0,
      verdicts: {
        correct: index === 29 ? 2 : 0,
        partial: index === 28 ? 1 : 0,
        wrong: 0,
      },
    })),
  }),
  getUserAnswerFeedbackStats: vi.fn().mockResolvedValue({
    total: 0,
    accurate: 0,
    partial: 0,
    inaccurate: 0,
    rate: null,
  }),
  exportAgentFeedbackCsv: vi.fn().mockResolvedValue({
    blob: new Blob(['id,task_id,verdict\n1,task-1,correct\n'], { type: 'text/csv' }),
    filename: 'arena-feedback-1-20260818.csv',
  }),
  exportAgentFeedbackJson: vi.fn().mockResolvedValue({
    blob: new Blob(['[{"task_id":"task-1","verdict":"correct"}]'], {
      type: 'application/json',
    }),
    filename: 'arena-feedback-1-20260818.json',
  }),
  exportAgentFeedbackMarkdown: vi.fn().mockResolvedValue({
    blob: new Blob(['# Arena — answer feedback'], { type: 'text/markdown' }),
    filename: 'arena-feedback-1-20260818.md',
  }),
  exportAgentFeedbackSummaryCsv: vi.fn((windowDays: number = 30) =>
    Promise.resolve({
      blob: new Blob(['date,feedback_count\n2026-08-18,2\n'], { type: 'text/csv' }),
      filename: `arena-feedback-activity-1-${windowDays}d-20260818.csv`,
    })),
  exportAgentFeedbackSummaryJson: vi.fn((windowDays: number = 30) =>
    Promise.resolve({
      blob: new Blob([`{"window_days":${windowDays},"daily_trend":[]}`], {
        type: 'application/json',
      }),
      filename: `arena-feedback-activity-1-${windowDays}d-20260818.json`,
    })),
  exportAgentFeedbackSummaryMarkdown: vi.fn((windowDays: number = 30) =>
    Promise.resolve({
      blob: feedbackSummaryMarkdownBlob,
      filename: `arena-feedback-activity-1-${windowDays}d-20260818.md`,
    })),
  getMcpIntegrations: vi.fn().mockResolvedValue({ integrations: [] }),
  };
});

function emptyWinRatePayload(overrides: Record<string, unknown> = {}) {
  return {
    window_days: 30,
    window_start: '2026-07-13',
    window_end: '2026-08-11',
    min_appearances: 1,
    include_fallback: false,
    low_confidence_threshold: 5,
    scored_exchanges: 0,
    unattributed_exchanges: 0,
    fallback_exchanges: 0,
    personas: [],
    best_persona_id: null,
    best_win_rate: null,
    ...overrides,
  };
}

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

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

vi.mock('../api', () => ({
  getSubscriptionStatus: hoistedMocks.getSubscriptionStatus,
  getUserUsage: hoistedMocks.getUserUsage,
  getAnalyticsActivity: hoistedMocks.getAnalyticsActivity,
  getAnalyticsCategoryStats: hoistedMocks.getAnalyticsCategoryStats,
  getAnalyticsPersonaWinRate: hoistedMocks.getAnalyticsPersonaWinRate,
  getCalibrationStats: hoistedMocks.getCalibrationStats,
  getRecentAgentFeedback: hoistedMocks.getRecentAgentFeedback,
  getAgentFeedbackSummary: hoistedMocks.getAgentFeedbackSummary,
  getUserAnswerFeedbackStats: hoistedMocks.getUserAnswerFeedbackStats,
  exportAgentFeedbackCsv: hoistedMocks.exportAgentFeedbackCsv,
  exportAgentFeedbackJson: hoistedMocks.exportAgentFeedbackJson,
  exportAgentFeedbackMarkdown: hoistedMocks.exportAgentFeedbackMarkdown,
  exportAgentFeedbackSummaryCsv: hoistedMocks.exportAgentFeedbackSummaryCsv,
  exportAgentFeedbackSummaryJson: hoistedMocks.exportAgentFeedbackSummaryJson,
  exportAgentFeedbackSummaryMarkdown: hoistedMocks.exportAgentFeedbackSummaryMarkdown,
  getMcpIntegrations: hoistedMocks.getMcpIntegrations,
  exportAnalyticsActivityCsv: hoistedMocks.exportAnalyticsActivityCsv,
  exportAnalyticsActivityJson: hoistedMocks.exportAnalyticsActivityJson,
  exportAnalyticsActivityMarkdown: hoistedMocks.exportAnalyticsActivityMarkdown,
  exportAnalyticsCategoryStatsCsv: hoistedMocks.exportAnalyticsCategoryStatsCsv,
  exportAnalyticsCategoryStatsJson: hoistedMocks.exportAnalyticsCategoryStatsJson,
  exportAnalyticsCategoryStatsMarkdown: hoistedMocks.exportAnalyticsCategoryStatsMarkdown,
  exportAnalyticsSummaryCsv: hoistedMocks.exportAnalyticsSummaryCsv,
  exportAnalyticsSummaryJson: hoistedMocks.exportAnalyticsSummaryJson,
  exportAnalyticsSummaryMarkdown: hoistedMocks.exportAnalyticsSummaryMarkdown,
  exportUserUsageCsv: hoistedMocks.exportUserUsageCsv,
  exportUserUsageJson: hoistedMocks.exportUserUsageJson,
  exportUserUsageMarkdown: hoistedMocks.exportUserUsageMarkdown,
  exportAnalyticsPersonaWinRateCsv: hoistedMocks.exportAnalyticsPersonaWinRateCsv,
  exportAnalyticsPersonaWinRateJson: hoistedMocks.exportAnalyticsPersonaWinRateJson,
  exportAnalyticsPersonaWinRateMarkdown: hoistedMocks.exportAnalyticsPersonaWinRateMarkdown,
  getCalibrationHistory: hoistedMocks.getCalibrationHistory,
  exportCalibrationHistoryCsv: vi.fn().mockResolvedValue(
    {
      blob: new Blob(['task_id,user_rating'], { type: 'text/csv' }),
      filename: 'arena-calibration-7-20260812.csv',
    },
  ),
  exportCalibrationHistoryJson: vi.fn().mockResolvedValue({
    blob: new Blob(['[{"task_id":"task-1"}]'], { type: 'application/json' }),
    filename: 'arena-calibration-7-20260812.json',
  }),
  exportCalibrationHistoryMarkdown: vi.fn().mockResolvedValue({
    blob: hoistedMocks.calibrationMarkdownBlob,
    filename: 'arena-calibration-7-20260812.md',
  }),
  patchUserProfile: vi.fn().mockResolvedValue({ ok: true }),
  cancelSubscription: vi.fn().mockResolvedValue({ ok: true }),
  reactivateSubscription: vi.fn().mockResolvedValue({ ok: true }),
  cancelAgentAddon: vi.fn().mockResolvedValue({ ok: true }),
  reactivateAgentAddon: vi.fn().mockResolvedValue({ ok: true }),
  postMcpManualConnect: vi.fn().mockResolvedValue({ ok: true }),
  deleteMcpIntegration: vi.fn().mockResolvedValue({ ok: true }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadBlobFile: vi.fn(() => true),
}));

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: hoistedMocks.copyToClipboard,
  copyCsvToClipboard: hoistedMocks.copyCsvToClipboard,
  copyMarkdownToClipboard: hoistedMocks.copyMarkdownToClipboard,
}));

/** Test helper that mounts the modal already open via the context. */
function ModalHarness() {
  const { openModal } = useProfileModal();
  // Open on mount so the portal renders synchronously by the time the test asserts.
  // Using a layout effect would also work; React's commit phase fires before
  // testing-library queries, so a render-phase call is fine here.
  if (typeof window !== 'undefined' && !(window as { __profileModalOpened?: boolean }).__profileModalOpened) {
    (window as { __profileModalOpened?: boolean }).__profileModalOpened = true;
    queueMicrotask(() => openModal('top-right'));
  }
  return <ProfileModal />;
}

function renderModal() {
  return render(
    <MemoryRouter>
      <ProfileModalProvider>
        <ModalHarness />
      </ProfileModalProvider>
    </MemoryRouter>,
  );
}

describe('ProfileModal', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    refreshUserMock.mockClear();
    refreshTierMock.mockClear();
    vi.mocked(hoistedMocks.getAnalyticsActivity).mockClear();
    vi.mocked(hoistedMocks.getAnalyticsCategoryStats).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsActivityCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsActivityJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsActivityMarkdown).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsCategoryStatsCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsCategoryStatsJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsCategoryStatsMarkdown).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsSummaryCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsSummaryJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsSummaryMarkdown).mockClear();
    vi.mocked(hoistedMocks.exportUserUsageCsv).mockClear();
    vi.mocked(hoistedMocks.exportUserUsageJson).mockClear();
    vi.mocked(hoistedMocks.exportUserUsageMarkdown).mockClear();
    vi.mocked(hoistedMocks.getAnalyticsPersonaWinRate).mockClear();
    vi.mocked(hoistedMocks.getCalibrationHistory).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateMarkdown).mockClear();
    vi.mocked(hoistedMocks.copyToClipboard).mockClear().mockResolvedValue(true);
    vi.mocked(hoistedMocks.copyCsvToClipboard).mockClear().mockResolvedValue(true);
    vi.mocked(hoistedMocks.copyMarkdownToClipboard).mockClear().mockResolvedValue(true);
    vi.mocked(hoistedMocks.exportAgentFeedbackCsv).mockClear();
    vi.mocked(hoistedMocks.exportAgentFeedbackJson).mockClear();
    vi.mocked(hoistedMocks.exportAgentFeedbackMarkdown).mockClear();
    vi.mocked(hoistedMocks.exportAgentFeedbackSummaryCsv).mockClear();
    vi.mocked(hoistedMocks.exportAgentFeedbackSummaryJson).mockClear();
    vi.mocked(downloadBlobFile).mockClear();
    (window as { __profileModalOpened?: boolean }).__profileModalOpened = false;
  });

  it('renders the Account section by default', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const accountHeadings = screen.getAllByText('Account');
    // The tab button + the section h2 both read "Account".
    expect(accountHeadings.length).toBeGreaterThanOrEqual(2);
  });

  it('applies the .profile-modal__field-label BEM class to form field labels', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const labels = document.querySelectorAll('.profile-modal__field-label');
    // Full name, Email address, Password, Your expertise background.
    expect(labels.length).toBe(4);
    // Spot-check the first label has the right class list (no inline style).
    const firstLabel = labels[0] as HTMLElement;
    expect(firstLabel.className).toBe('profile-modal__field-label');
    expect(firstLabel.style.fontSize).toBe('');
  });

  it('renders the analytics activity export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const usageTab = screen.getByRole('button', { name: /usage/i });
    usageTab.click();
    expect(
      await screen.findByRole('button', { name: /^🗓️ activity json export$/i }),
    ).toBeInTheDocument();
  });

  it('renders and downloads the analytics summary JSON export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /^📊 summary json export$/i });
    expect(button).toHaveStyle({ color: '#4A3728' });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryJson).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-summary-2026-07-13-to-2026-08-11.json',
      );
    });
  });

  it('renders and downloads the analytics summary Markdown export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /^📊 summary markdown export$/i });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryMarkdown).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-summary-2026-07-13-to-2026-08-11.md',
      );
    });
  });

  it('copies analytics summary JSON for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /analytics summary export window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy summary json/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryJson).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith(
        '{"window_days":30,"total_prompts":42}',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied analytics summary JSON to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces analytics summary JSON clipboard failures', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy summary json/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy analytics summary JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('copies analytics summary Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /analytics summary export window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy summary markdown/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryMarkdown).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('# Arena — analytics summary');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied analytics summary Markdown to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('locks the summary window while analytics summary Markdown is being copied', async () => {
    let resolveExport: ((value: { blob: Blob; filename: string }) => void) | undefined;
    const pendingExport = new Promise<{ blob: Blob; filename: string }>((resolve) => {
      resolveExport = resolve;
    });
    hoistedMocks.exportAnalyticsSummaryMarkdown.mockImplementationOnce(
      () => pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /analytics summary export window/i,
    });
    const copyButton = await screen.findByRole('button', { name: /copy summary markdown/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryMarkdown).toHaveBeenCalledWith(30);
    });
    expect(windowSelect).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');

    resolveExport?.({
      blob: hoistedMocks.summaryMarkdownBlob,
      filename: 'arena-summary-30d.md',
    });
    await waitFor(() => {
      expect(windowSelect).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('surfaces analytics summary clipboard failures', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy summary markdown/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy analytics summary Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('copies analytics summary CSV for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /analytics summary export window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy summary csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryCsv).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith(
        'metric,value\ntotal_prompts,42\n',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied analytics summary CSV to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces analytics summary CSV clipboard failures', async () => {
    hoistedMocks.copyCsvToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy summary csv/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy analytics summary CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('uses the selected window for every analytics summary export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /analytics summary export window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '90' } });

    fireEvent.click(await screen.findByRole('button', { name: /^📊 summary export$/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryCsv).toHaveBeenCalledWith(90);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-analytics-summary-90d.csv',
      );
    });

    fireEvent.click(await screen.findByRole('button', { name: /^📊 summary json export$/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryJson).toHaveBeenCalledWith(90);
    });

    fireEvent.click(await screen.findByRole('button', { name: /^📊 summary markdown export$/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsSummaryMarkdown).toHaveBeenCalledWith(90);
    });
  });

  it('renders and downloads the analytics activity JSON export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /^🗓️ activity json export$/i });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityJson).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-activity-2026-08-05-to-2026-08-11.json',
      );
    });
  });

  it('renders and downloads the analytics activity Markdown export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /^🗓️ activity markdown export$/i });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityMarkdown).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-activity-2026-08-05-to-2026-08-11.md',
      );
    });
  });

  it('copies analytics activity Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /activity highlights window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy activity markdown/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityMarkdown).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('# Arena — activity timeline');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied activity Markdown to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('locks the activity window while activity Markdown is being copied', async () => {
    let resolveExport: ((value: { blob: Blob; filename: string }) => void) | undefined;
    const pendingExport = new Promise<{ blob: Blob; filename: string }>((resolve) => {
      resolveExport = resolve;
    });
    hoistedMocks.exportAnalyticsActivityMarkdown.mockImplementationOnce(
      () => pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    const copyButton = await screen.findByRole('button', { name: /copy activity markdown/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityMarkdown).toHaveBeenCalledWith(30);
    });
    expect(windowSelect).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');

    resolveExport?.({
      blob: hoistedMocks.activityMarkdownBlob,
      filename: 'arena-activity-30d.md',
    });
    await waitFor(() => {
      expect(windowSelect).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('surfaces activity Markdown clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy activity markdown/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy activity Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('renders and downloads the persona win-rate Markdown export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /win rates markdown export/i,
    });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-persona-win-rate-2026-07-13-to-2026-08-11.md',
      );
    });
  });

  it('copies persona win-rate Markdown with the selected filters', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona win-rate window/i }),
      { target: { value: '7' } },
    );
    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona win-rate minimum appearances/i }),
      { target: { value: '5' } },
    );
    fireEvent.click(await screen.findByRole('checkbox', { name: /include fallback scorings/i }));
    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenLastCalledWith(7, 5, true);
    });

    const button = await screen.findByRole('button', { name: /copy win rates markdown/i });
    vi.useFakeTimers();
    try {
      await act(async () => {
        button.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(hoistedMocks.exportAnalyticsPersonaWinRateMarkdown).toHaveBeenCalledWith(7, 5, true);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('# Arena — persona win rates');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied persona win rates Markdown to the clipboard.',
      );
      expect(button).toHaveStyle({ color: '#4A3728' });

      fireEvent.change(
        screen.getByRole('combobox', { name: /persona win-rate window/i }),
        { target: { value: '14' } },
      );
      expect(screen.queryByText('Copied persona win rates Markdown to the clipboard.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces clipboard failures and releases the persona win-rate copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy win rates markdown/i });
    button.click();

    await waitFor(() => {
      expect(
        screen.getByText('Could not copy persona win-rate Markdown — try again.'),
      ).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
  });

  it('uses the selected window and server filename for the win-rate JSON export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /persona win-rate window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });
    hoistedMocks.exportAnalyticsPersonaWinRateJson.mockResolvedValueOnce({
      blob: new Blob(['{"window_days":7,"personas":[]}'], { type: 'application/json' }),
      filename: 'arena-persona-win-rate-2026-08-11-to-2026-08-17.json',
    });
    const exportButton = await screen.findByRole('button', { name: /win rates json export/i });
    exportButton.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateJson).toHaveBeenCalledWith(7, 1, false);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-persona-win-rate-2026-08-11-to-2026-08-17.json',
      );
    });
  });

  it('renders calibration history export buttons when ratings exist', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 3,
      avg_delta: 2.0,
      trend: 'stable',
      calibration_score: 92,
      recent_ratings: [
        { delta: 5, created_at: '2026-08-11T10:00:00Z' },
        { delta: -3, created_at: '2026-08-10T10:00:00Z' },
      ],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByRole('button', { name: /calibration csv export/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /calibration json export/i }),
    ).toBeInTheDocument();
  });

  it('downloads answer feedback CSV when feedback exists', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 2,
      correct_pct: 50,
      partial_pct: 0,
      wrong_pct: 50,
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /answer feedback csv export/i });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackCsv).toHaveBeenCalledTimes(1);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-feedback-1-20260818.csv',
      );
    });
  });

  it('surfaces a blocked answer feedback download and releases the export lock', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 1,
      correct_pct: 100,
      partial_pct: 0,
      wrong_pct: 0,
    });
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /answer feedback csv export/i });
    button.click();

    expect(
      await screen.findByText('Could not download answer feedback CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('downloads answer feedback JSON when feedback exists', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 2,
      correct_pct: 50,
      partial_pct: 0,
      wrong_pct: 50,
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /answer feedback json export/i });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackJson).toHaveBeenCalledTimes(1);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-feedback-1-20260818.json',
      );
    });
  });

  it('surfaces a blocked answer feedback JSON download and releases the export lock', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 1,
      correct_pct: 100,
      partial_pct: 0,
      wrong_pct: 0,
    });
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /answer feedback json export/i });
    button.click();

    expect(
      await screen.findByText('Could not download answer feedback JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('downloads answer feedback Markdown when feedback exists', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 2,
      correct_pct: 50,
      partial_pct: 0,
      wrong_pct: 50,
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /answer feedback markdown export/i,
    });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackMarkdown).toHaveBeenCalledTimes(1);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-feedback-1-20260818.md',
      );
    });
  });

  it('applies the selected verdict when exporting answer feedback', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 2,
      correct_pct: 50,
      partial_pct: 50,
      wrong_pct: 0,
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const filter = await screen.findByRole('combobox', {
      name: /answer feedback export filter/i,
    });
    expect(filter).toHaveStyle({ color: '#4A3728' });
    fireEvent.change(filter, { target: { value: 'partial' } });
    const exportButton = screen.getByRole('button', { name: /answer feedback csv export/i });
    expect(exportButton).toHaveStyle({ color: '#4A3728' });
    exportButton.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackCsv).toHaveBeenCalledWith('partial');
    });
  });

  it('applies the selected UTC date range when exporting answer feedback', async () => {
    hoistedMocks.getUserAnswerFeedbackStats.mockResolvedValueOnce({
      total: 2,
      correct_pct: 50,
      partial_pct: 50,
      wrong_pct: 0,
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const fromDate = await screen.findByLabelText('Answer feedback export start date');
    const toDate = screen.getByLabelText('Answer feedback export end date');
    fireEvent.change(fromDate, { target: { value: '2026-08-01' } });
    fireEvent.change(toDate, { target: { value: '2026-08-18' } });
    screen.getByRole('button', { name: /answer feedback csv export/i }).click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackCsv).toHaveBeenCalledWith(undefined, {
        fromDate: '2026-08-01',
        toDate: '2026-08-18',
      });
    });
  });

  it('shows feedback activity and reloads it for a different window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByRole('img', { name: /feedback activity over the last 30 days/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /feedback activity verdict breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Correct: 2' })).toBeInTheDocument();
    const windowSelect = screen.getByRole('combobox', { name: /feedback activity window/i });
    fireEvent.change(windowSelect, { target: { value: '7' } });

    await waitFor(() => {
      expect(hoistedMocks.getAgentFeedbackSummary).toHaveBeenLastCalledWith(7);
    });
  });

  it('filters recent ratings by verdict', async () => {
    const recentRatings = [
      {
        task_id: 'task-correct',
        verdict: 'correct',
        note: null,
        created_at: '2026-08-18T09:00:00Z',
        title: 'Correct answer',
        task_text: null,
      },
      {
        task_id: 'task-wrong',
        verdict: 'wrong',
        note: null,
        created_at: '2026-08-18T08:00:00Z',
        title: 'Wrong answer',
        task_text: null,
      },
    ];
    vi.mocked(hoistedMocks.getRecentAgentFeedback)
      .mockResolvedValueOnce(recentRatings)
      .mockResolvedValueOnce([recentRatings[1]]);
    vi.mocked(hoistedMocks.getUserAnswerFeedbackStats).mockClear();

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const filter = await screen.findByRole('combobox', { name: /recent ratings filter/i });
    expect(await screen.findByRole('button', { name: 'Correct answer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wrong answer' })).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: 'wrong' } });

    await waitFor(() => {
      expect(hoistedMocks.getRecentAgentFeedback).toHaveBeenLastCalledWith(10, 'wrong');
    });
    expect(hoistedMocks.getUserAnswerFeedbackStats).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Wrong answer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct answer' })).not.toBeInTheDocument();
  });

  it('announces unclassified feedback in the activity chart', async () => {
    vi.mocked(hoistedMocks.getAgentFeedbackSummary).mockResolvedValueOnce({
      total: 5,
      verdicts: { correct: 2, partial: 1, wrong: 1 },
      rate: 0.4,
      window_days: 30,
      daily_trend: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        count: index === 29 ? 3 : index === 28 ? 1 : 0,
        verdicts: {
          correct: index === 29 ? 2 : 0,
          partial: index === 28 ? 1 : 0,
          wrong: 0,
        },
      })),
    });

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByRole('img', {
        name: /feedback activity over the last 30 days.*1 other/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Other: 1' })).toBeInTheDocument();
  });

  it('downloads feedback activity CSV for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /feedback activity window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });
    const button = await screen.findByRole('button', {
      name: /feedback activity csv export/i,
    });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackSummaryCsv).toHaveBeenCalledWith(7);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-feedback-activity-1-7d-20260818.csv',
      );
    });
  });

  it('downloads feedback activity JSON for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /feedback activity window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });
    const button = await screen.findByRole('button', {
      name: /^🧭 feedback activity json export$/i,
    });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackSummaryJson).toHaveBeenCalledWith(7);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-feedback-activity-1-7d-20260818.json',
      );
    });
  });

  it('downloads feedback activity Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /feedback activity window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });
    const button = await screen.findByRole('button', {
      name: /^🧭 feedback activity markdown export$/i,
    });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackSummaryMarkdown).toHaveBeenCalledWith(7);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-feedback-activity-1-7d-20260818.md',
      );
    });
  });

  it('copies feedback activity Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /feedback activity window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });
    const button = await screen.findByRole('button', {
      name: /^🧭 copy feedback activity markdown$/i,
    });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAgentFeedbackSummaryMarkdown).toHaveBeenCalledWith(7);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith(
        '# Arena — feedback activity\n',
      );
      expect(
        screen.getByText('Copied feedback activity Markdown to the clipboard.'),
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByRole('combobox', { name: /feedback activity window/i }),
      { target: { value: '90' } },
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Copied feedback activity Markdown to the clipboard.'),
      ).not.toBeInTheDocument();
    });
  });

  it('surfaces feedback activity clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🧭 copy feedback activity markdown$/i,
    });
    button.click();

    await waitFor(() => {
      expect(
        screen.getByText('Could not copy feedback activity Markdown — try again.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^🧭 copy feedback activity markdown$/i }),
      ).not.toBeDisabled();
    });
  });

  it('views and paginates recent calibration history', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 6,
      avg_delta: 2.0,
      trend: 'stable',
      calibration_score: 92,
      recent_ratings: [{ delta: 5, created_at: '2026-08-11T10:00:00Z' }],
    });
    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [
        {
          id: 11,
          task_id: 'task-history-1',
          user_rating: 4,
          system_score: 95,
          delta: 15,
          verdict: 'You underestimated this answer',
          created_at: '2026-08-11T10:00:00Z',
        },
      ],
      total: 6,
      page: 1,
      per_page: 5,
      total_pages: 2,
      filters: { min_delta: null, max_delta: null, sort: 'newest' },
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const openHistory = await screen.findByRole('button', {
      name: /view calibration history \(6\)/i,
    });
    openHistory.click();

    const history = await screen.findByRole('region', { name: /calibration history/i });
    expect(within(history).getByText('2026-08-11')).toBeInTheDocument();
    expect(within(history).getByText('You underestimated this answer')).toBeInTheDocument();
    expect(hoistedMocks.getCalibrationHistory).toHaveBeenCalledWith({
      page: 1,
      perPage: 5,
      sort: 'newest',
    });

    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [],
      total: 6,
      page: 2,
      per_page: 5,
      total_pages: 2,
      filters: { min_delta: null, max_delta: null, sort: 'newest' },
    });
    screen.getByRole('button', { name: /next calibration history page/i }).click();
    await waitFor(() => {
      expect(hoistedMocks.getCalibrationHistory).toHaveBeenLastCalledWith({
        page: 2,
        perPage: 5,
        sort: 'newest',
      });
    });
    expect(await screen.findByText('No calibration ratings on this page.')).toBeInTheDocument();
    expect(
      within(history).getByRole('button', { name: /previous calibration history page/i }),
    ).toBeEnabled();

    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [
        {
          id: 11,
          task_id: 'task-history-1',
          user_rating: 4,
          system_score: 95,
          delta: 15,
          verdict: 'You underestimated this answer',
          created_at: '2026-08-11T10:00:00Z',
        },
      ],
      total: 6,
      page: 1,
      per_page: 5,
      total_pages: 2,
      filters: { min_delta: null, max_delta: null, sort: 'newest' },
    });
    within(history).getByRole('button', { name: /previous calibration history page/i }).click();
    await waitFor(() => {
      expect(hoistedMocks.getCalibrationHistory).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 5,
        sort: 'newest',
      });
    });
    expect(await screen.findByText('You underestimated this answer')).toBeInTheDocument();
  });

  it('sorts calibration history and returns to the first page', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 6,
      avg_delta: 2.0,
      trend: 'stable',
      calibration_score: 92,
      recent_ratings: [{ delta: 5, created_at: '2026-08-11T10:00:00Z' }],
    });
    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [],
      total: 6,
      page: 1,
      per_page: 5,
      total_pages: 2,
      filters: { min_delta: null, max_delta: null, sort: 'newest' },
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const openHistory = await screen.findByRole('button', {
      name: /view calibration history \(6\)/i,
    });
    openHistory.click();
    const history = await screen.findByRole('region', { name: /calibration history/i });

    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [
        {
          id: 12,
          task_id: 'task-history-2',
          user_rating: 2,
          system_score: 60,
          delta: 20,
          verdict: 'You underestimated this answer',
          created_at: '2026-08-09T10:00:00Z',
        },
      ],
      total: 6,
      page: 1,
      per_page: 5,
      total_pages: 2,
      filters: { min_delta: null, max_delta: null, sort: 'delta_desc' },
    });
    fireEvent.change(
      within(history).getByRole('combobox', { name: /calibration history sort/i }),
      { target: { value: 'delta_desc' } },
    );

    await waitFor(() => {
      expect(hoistedMocks.getCalibrationHistory).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 5,
        sort: 'delta_desc',
      });
    });
    expect(within(history).getByDisplayValue('Underestimates first')).toBeInTheDocument();
    expect(within(history).getByText('Underestimates first · 6 total ratings')).toBeInTheDocument();
    expect(await within(history).findByText('You underestimated this answer')).toBeInTheDocument();
  });

  it('downloads calibration history CSV with the server filename', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 1,
      avg_delta: 0,
      trend: 'stable',
      calibration_score: 100,
      recent_ratings: [{ delta: 0, created_at: '2026-08-11T10:00:00Z' }],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /calibration csv export/i,
    });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-calibration-7-20260812.csv',
      );
    });
  });

  it('downloads calibration history JSON with the server filename', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 1,
      avg_delta: 0,
      trend: 'stable',
      calibration_score: 100,
      recent_ratings: [{ delta: 0, created_at: '2026-08-11T10:00:00Z' }],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /calibration json export/i,
    });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-calibration-7-20260812.json',
      );
    });
  });

  it('downloads calibration history Markdown with the server filename', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 1,
      avg_delta: 0,
      trend: 'stable',
      calibration_score: 100,
      recent_ratings: [{ delta: 0, created_at: '2026-08-11T10:00:00Z' }],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /calibration markdown export/i,
    });
    expect(button).toHaveStyle({ color: '#4A3728' });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-calibration-7-20260812.md',
      );
    });
  });

  it('surfaces blocked calibration Markdown downloads and releases the export lock', async () => {
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 1,
      avg_delta: 0,
      trend: 'stable',
      calibration_score: 100,
      recent_ratings: [{ delta: 0, created_at: '2026-08-11T10:00:00Z' }],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /calibration markdown export/i,
    });
    button.click();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not download calibration Markdown — try again.',
      );
      expect(button).not.toBeDisabled();
    });
  });

  it('copies calibration history Markdown and reports success', async () => {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 1,
      avg_delta: 0,
      trend: 'stable',
      calibration_score: 100,
      recent_ratings: [{ delta: 0, created_at: '2026-08-11T10:00:00Z' }],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /copy calibration markdown/i,
    });
    button.click();

    await waitFor(() => {
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith(
        '# Arena — confidence calibration',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied calibration Markdown to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces calibration Markdown clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 1,
      avg_delta: 0,
      trend: 'stable',
      calibration_score: 100,
      recent_ratings: [{ delta: 0, created_at: '2026-08-11T10:00:00Z' }],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', {
      name: /copy calibration markdown/i,
    });
    button.click();

    expect(
      await screen.findByText('Could not copy calibration Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('renders the usage history export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const usageTab = screen.getByRole('button', { name: /usage/i });
    usageTab.click();
    expect(
      await screen.findByRole('button', { name: /usage history export/i }),
    ).toBeInTheDocument();
  });

  it('renders the usage JSON export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const usageTab = screen.getByRole('button', { name: /usage/i });
    usageTab.click();
    expect(
      await screen.findByRole('button', { name: /usage json export/i }),
    ).toBeInTheDocument();
  });

  it('renders the usage Markdown export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    expect(
      await screen.findByRole('button', { name: /usage markdown export/i }),
    ).toBeInTheDocument();
  });

  it('copies usage Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /usage export window/i }),
      { target: { value: '30' } },
    );
    const button = await screen.findByRole('button', { name: /copy usage markdown/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportUserUsageMarkdown).toHaveBeenCalledWith(30);
      expect(hoistedMocks.copyMarkdownToClipboard).toHaveBeenCalledWith(
        '# Arena — usage report',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied usage Markdown to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('locks the usage window while usage Markdown is being copied', async () => {
    let resolveExport: ((value: { blob: Blob; filename: string }) => void) | undefined;
    const pendingExport = new Promise<{ blob: Blob; filename: string }>((resolve) => {
      resolveExport = resolve;
    });
    hoistedMocks.exportUserUsageMarkdown.mockImplementationOnce(() => pendingExport);

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', { name: /usage export window/i });
    const copyButton = await screen.findByRole('button', { name: /copy usage markdown/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportUserUsageMarkdown).toHaveBeenCalledWith(14);
    });
    expect(windowSelect).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');

    resolveExport?.({
      blob: hoistedMocks.usageMarkdownBlob,
      filename: 'arena-usage-14d.md',
    });
    await waitFor(() => {
      expect(windowSelect).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('surfaces usage Markdown clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyMarkdownToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy usage markdown/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy usage Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('renders activity highlights from the live timeline', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(await screen.findByText('2 days')).toBeInTheDocument();
    expect(screen.getByText('6 days')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/busiest day/i)).toHaveTextContent('2026-08-10');
    expect(
      screen.getByRole('group', { name: /activity highlights/i }),
    ).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsActivity).toHaveBeenCalledWith(30);
  });

  it('reloads activity highlights when the window changes', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });

    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsActivity).toHaveBeenLastCalledWith(7);
      expect(screen.getByText('Activity highlights · 7 days')).toBeInTheDocument();
    });
  });

  it('exports activity for the selected highlights window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '90' } });
    const exportButton = await screen.findByRole('button', { name: /activity export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityCsv).toHaveBeenCalledWith(90);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-activity-90d.csv',
      );
    });

    fireEvent.click(await screen.findByRole('button', { name: /^🗓️ activity json export$/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityJson).toHaveBeenCalledWith(90);
    });

    fireEvent.click(await screen.findByRole('button', { name: /^🗓️ activity markdown export$/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityMarkdown).toHaveBeenCalledWith(90);
    });
  });

  it('renders category performance from the live endpoint', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /category performance/i });
    expect(within(group).getByRole('cell', { name: 'question' })).toBeInTheDocument();
    expect(within(group).getByText('Analyst')).toBeInTheDocument();
    expect(within(group).getByText('83%')).toBeInTheDocument();
    expect(within(group).getByText(/most active/i)).toHaveTextContent('question');
    expect(hoistedMocks.getAnalyticsCategoryStats).toHaveBeenCalledWith(30);
  });

  it('refreshes category performance with the activity window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });

    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsCategoryStats).toHaveBeenLastCalledWith(7);
      expect(screen.getByText('Category performance · 7 days')).toBeInTheDocument();
    });
  });

  it('retries category performance after a failed load', async () => {
    hoistedMocks.getAnalyticsCategoryStats.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const retry = await screen.findByRole('button', {
      name: /retry loading category performance/i,
    });
    fireEvent.click(retry);

    expect(await screen.findByText('Analyst')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsCategoryStats).toHaveBeenCalledTimes(2);
  });

  it('exports category performance as JSON for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '90' } });
    fireEvent.click(await screen.findByRole('button', { name: /categories json export/i }));

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsCategoryStatsJson).toHaveBeenCalledWith(90);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-category-stats-2026-08-05-to-2026-08-11.json',
      );
    });
  });

  it('exports category performance CSV for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '90' } });
    fireEvent.click(await screen.findByRole('button', { name: /categories export/i }));

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsCategoryStatsCsv).toHaveBeenCalledWith(90);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-category-stats-90d.csv',
      );
    });
  });

  it('shows category CSV export failures instead of hiding them', async () => {
    hoistedMocks.exportAnalyticsCategoryStatsCsv.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    fireEvent.click(await screen.findByRole('button', { name: /categories export/i }));

    expect(
      await screen.findByText('Could not download category stats CSV — try again.'),
    ).toBeInTheDocument();
  });

  it('exports category performance as Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '90' } });
    fireEvent.click(await screen.findByRole('button', { name: /categories markdown export/i }));

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsCategoryStatsMarkdown).toHaveBeenCalledWith(90);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-category-stats-2026-08-05-to-2026-08-11.md',
      );
    });
  });

  it('copies category performance Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '90' } });
    const copyButton = await screen.findByRole('button', { name: /copy categories markdown/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsCategoryStatsMarkdown).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('# Arena — category stats');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied category stats Markdown to the clipboard.',
      );
    });
    expect(copyButton).not.toBeDisabled();
  });

  it('locks the activity window while category Markdown is being copied', async () => {
    let resolveExport: ((value: { blob: Blob; filename: string }) => void) | undefined;
    const pendingExport = new Promise<{ blob: Blob; filename: string }>((resolve) => {
      resolveExport = resolve;
    });
    hoistedMocks.exportAnalyticsCategoryStatsMarkdown.mockImplementationOnce(
      () => pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    const copyButton = await screen.findByRole('button', { name: /copy categories markdown/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsCategoryStatsMarkdown).toHaveBeenCalledWith(30);
    });
    expect(windowSelect).toBeDisabled();
    expect(copyButton).toBeDisabled();

    resolveExport?.({
      blob: hoistedMocks.categoryStatsMarkdownBlob,
      filename: 'arena-category-stats-30d.md',
    });
    await waitFor(() => {
      expect(windowSelect).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
    });
  });

  it('surfaces category Markdown clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const copyButton = await screen.findByRole('button', { name: /copy categories markdown/i });
    fireEvent.click(copyButton);

    expect(
      await screen.findByText('Could not copy category stats Markdown — try again.'),
    ).toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it('shows a fallback message when activity highlights fail to load', async () => {
    hoistedMocks.getAnalyticsActivity.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText('Could not load activity highlights'),
    ).toBeInTheDocument();
  });

  it('retries activity highlights after a failed load', async () => {
    hoistedMocks.getAnalyticsActivity.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const retry = await screen.findByRole('button', {
      name: /retry loading activity highlights/i,
    });
    retry.click();

    expect(await screen.findByText('2 days')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsActivity).toHaveBeenCalledTimes(2);
  });

  it('renders persona win rates from the live endpoint', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /persona win rates/i });
    expect(within(group).getAllByText('The Analyst').length).toBeGreaterThan(0);
    expect(within(group).getByText('The Philosopher')).toBeInTheDocument();
    expect(within(group).getByText('75%')).toBeInTheDocument();
    expect(within(group).getByText(/best:/i)).toHaveTextContent('The Analyst');
    expect(within(group).getByText('low sample')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenCalledWith(30, 1);
  });

  it('refreshes persona win rates when the analysis window changes', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /persona win-rate window/i,
    });
    expect(windowSelect).toHaveValue('30');

    fireEvent.change(windowSelect, { target: { value: '7' } });

    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenLastCalledWith(7, 1);
    });
    expect(screen.getByText('Persona win rates · 7 days')).toBeInTheDocument();
  });

  it('sorts persona win rates by the selected table metric', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockResolvedValueOnce({
      window_days: 30,
      window_start: '2026-07-13',
      window_end: '2026-08-11',
      min_appearances: 1,
      include_fallback: false,
      low_confidence_threshold: 5,
      scored_exchanges: 10,
      unattributed_exchanges: 0,
      fallback_exchanges: 0,
      personas: [
        {
          persona_id: 'analyst',
          name: 'The Analyst',
          color: '#F0B84E',
          appearances: 8,
          wins: 2,
          win_rate: 0.25,
          low_confidence: false,
          trend_omitted_appearances: 0,
          trend_omitted_wins: 0,
          trend: [],
        },
        {
          persona_id: 'philosopher',
          name: 'The Philosopher',
          color: '#8C7355',
          appearances: 3,
          wins: 2,
          win_rate: 0.667,
          low_confidence: true,
          trend_omitted_appearances: 0,
          trend_omitted_wins: 0,
          trend: [],
        },
      ],
      best_persona_id: 'philosopher',
      best_win_rate: 0.667,
    });

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /persona win rates/i });
    const rowsBeforeSort = within(group).getAllByRole('row');
    expect(rowsBeforeSort[1]).toHaveTextContent('The Philosopher');
    expect(within(group).getByRole('columnheader', { name: 'Rate' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona win-rate sort/i }),
      { target: { value: 'appearances' } },
    );

    await waitFor(() => {
      const rowsAfterSort = within(group).getAllByRole('row');
      expect(rowsAfterSort[1]).toHaveTextContent('The Analyst');
      expect(within(group).getByRole('columnheader', { name: 'Appearances' })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      expect(within(group).getByRole('columnheader', { name: 'Rate' })).not.toHaveAttribute(
        'aria-sort',
      );
    });
  });

  it('refreshes persona win rates and exports when the minimum sample changes', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const sampleSelect = await screen.findByRole('combobox', {
      name: /persona win-rate minimum appearances/i,
    });
    expect(sampleSelect).toHaveValue('1');
    fireEvent.change(sampleSelect, { target: { value: '5' } });

    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenLastCalledWith(30, 5);
    });

    const exportButton = await screen.findByRole('button', { name: /win rates json export/i });
    exportButton.click();
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateJson).toHaveBeenCalledWith(30, 5, false);
    });
  });

  it('can include fallback scorings with a provisional-data warning', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const toggle = await screen.findByRole('checkbox', { name: /include fallback scorings/i });
    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenCalledWith(30, 1);
    });
    hoistedMocks.getAnalyticsPersonaWinRate.mockResolvedValueOnce(
      emptyWinRatePayload({
        include_fallback: true,
        scored_exchanges: 2,
        fallback_exchanges: 2,
      }),
    );
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenLastCalledWith(30, 1, true);
    });
    expect(
      await screen.findByText(
        'Includes 2 fallback scorings; those winners are provisional because the panel was not judged.',
      ),
    ).toBeInTheDocument();

    const exportButton = await screen.findByRole('button', { name: /win rates json export/i });
    exportButton.click();
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateJson).toHaveBeenCalledWith(30, 1, true);
    });
  });

  it('uses the selected window and server filename for the win-rate CSV export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /persona win-rate window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });
    hoistedMocks.exportAnalyticsPersonaWinRateCsv.mockResolvedValueOnce({
      blob: new Blob(['persona_id,name'], { type: 'text/csv' }),
      filename: 'arena-persona-win-rate-2026-08-11-to-2026-08-17.csv',
    });
    const exportButton = await screen.findByRole('button', { name: /win rates export/i });
    exportButton.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateCsv).toHaveBeenCalledWith(7, 1, false);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-persona-win-rate-2026-08-11-to-2026-08-17.csv',
      );
    });
  });

  it('surfaces a blocked persona win-rate download and releases the export lock', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    const exportButton = await screen.findByRole('button', { name: /win rates export/i });
    exportButton.click();

    expect(
      await screen.findByText('Could not download persona win-rate CSV — try again.'),
    ).toBeInTheDocument();
    expect(exportButton).not.toBeDisabled();
  });

  it('renders an accessible weekly trend sparkline per persona', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /persona win rates/i });
    expect(
      within(group).getByRole('img', { name: /The Analyst win rate trend/i }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('img', { name: /The Philosopher win rate trend/i }),
    ).toBeInTheDocument();
  });

  it('sparkline label spells out rates and marks empty weeks as no data', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /persona win rates/i });
    expect(
      within(group).getByRole('img', {
        name: 'The Analyst win rate trend over the last 5 weeks: 50%, 100%, 100%, 50%, 100%',
      }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('img', {
        name: 'The Philosopher win rate trend over the last 3 weeks: 50%, no data, 100%',
      }),
    ).toBeInTheDocument();
  });

  it('marks sparklines whose older exchanges are not plotted', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockResolvedValueOnce({
      window_days: 30,
      window_start: '2026-07-13',
      window_end: '2026-08-11',
      min_appearances: 1,
      include_fallback: false,
      low_confidence_threshold: 5,
      scored_exchanges: 3,
      unattributed_exchanges: 0,
      fallback_exchanges: 0,
      personas: [
        {
          persona_id: 'analyst',
          name: 'The Analyst',
          color: '#F0B84E',
          appearances: 3,
          wins: 2,
          win_rate: 0.667,
          low_confidence: false,
          trend_omitted_appearances: 2,
          trend_omitted_wins: 1,
          trend: [
            {
              bucket_start: '2026-08-03',
              bucket_end: '2026-08-09',
              appearances: 1,
              wins: 1,
              win_rate: 1,
            },
          ],
        },
      ],
      best_persona_id: 'analyst',
      best_win_rate: 0.667,
    });

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /persona win rates/i });
    expect(within(group).getByText('+2 older')).toBeInTheDocument();
    expect(
      within(group).getByRole('img', {
        name: 'The Analyst win rate trend over the last 1 weeks: 100%, 2 older appearances not plotted',
      }),
    ).toBeInTheDocument();
  });

  it('shows a fallback message when persona win rates fail to load', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText('Could not load persona win rates'),
    ).toBeInTheDocument();
  });

  it('explains when the minimum sample hides all personas', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockResolvedValueOnce(
      emptyWinRatePayload({ scored_exchanges: 4, min_appearances: 5 }),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText(
        'No persona reached the 5-appearance minimum in the last 30 days.',
      ),
    ).toBeInTheDocument();
  });

  it('retries persona win rates after a failed load', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const retry = await screen.findByRole('button', {
      name: /retry loading persona win rates/i,
    });
    retry.click();

    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenCalledTimes(2);
  });

  it('explains fallback-only windows in the persona win-rate empty state', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockResolvedValueOnce(
      emptyWinRatePayload({ fallback_exchanges: 4 }),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText(
        'No judged panels in the last 30 days yet — fallback scorings are excluded.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the plain empty-state copy when there is no activity at all', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockResolvedValueOnce(emptyWinRatePayload());
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText('No scored panels in the last 30 days yet.'),
    ).toBeInTheDocument();
  });

  it('downloads usage JSON with the server-provided filename', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /usage json export/i });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-usage-2026-07-29-to-2026-08-11.json',
      );
    });
  });

  it('downloads usage Markdown with the server-provided filename', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /usage markdown export/i });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-usage-2026-07-29-to-2026-08-11.md',
      );
    });
  });

  it('uses the selected usage window for every export format', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /usage export window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '30' } });

    fireEvent.click(await screen.findByRole('button', { name: /usage history export/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportUserUsageCsv).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-usage-30d.csv',
      );
    });

    fireEvent.click(await screen.findByRole('button', { name: /usage json export/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportUserUsageJson).toHaveBeenCalledWith(30);
    });

    fireEvent.click(await screen.findByRole('button', { name: /usage markdown export/i }));
    await waitFor(() => {
      expect(hoistedMocks.exportUserUsageMarkdown).toHaveBeenCalledWith(30);
    });
  });

  it('applies the .profile-modal__input BEM class with --readonly variant on the disabled email', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // findByDisplayValue auto-waits for the value attribute to be set;
    // the email input's value comes from `user.email` (synchronous on
    // the auth state object), so it should be present on first paint.
    const email = (await screen.findByDisplayValue('sahaj@example.com')) as HTMLInputElement;
    expect(email.disabled).toBe(true);
    expect(email.className).toContain('profile-modal__input');
    expect(email.className).toContain('profile-modal__input--readonly');
  });

  it('applies the .profile-modal__input class without --readonly on the editable full name', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // The full-name input's value is set from `user.name` via a useEffect
    // after the dialog mounts. In CI's slower event loop the effect can
    // lag the first paint, so use the async findBy* query to wait.
    const fullName = (await screen.findByDisplayValue('Sahaj Patel')) as HTMLInputElement;
    expect(fullName.disabled).toBe(false);
    expect(fullName.className).toBe('profile-modal__input');
  });

  it('applies the .profile-modal__section-heading BEM class to the Plan tab heading after click', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // The Plan tab is one of the 5 tab buttons.
    const planTab = screen.getByRole('button', { name: /plan/i });
    planTab.click();
    await waitFor(() => {
      expect(
        document.querySelector('.profile-modal__section-heading'),
      ).toBeTruthy();
    });
    const heading = document.querySelector('.profile-modal__section-heading');
    expect(heading?.textContent).toBe('Your plan');
    // The heading has the BEM class and no inline style overrides.
    expect((heading as HTMLElement).style.fontSize).toBe('');
  });

  it('applies .profile-modal__plan-heading to the plan name + .profile-modal__plan-billing to the line under it', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const planTab = screen.getByRole('button', { name: /plan/i });
    planTab.click();
    await waitFor(() => {
      expect(document.querySelector('.profile-modal__plan-heading')).toBeTruthy();
    });
    const planHeading = document.querySelector('.profile-modal__plan-heading');
    const planBilling = document.querySelector('.profile-modal__plan-billing');
    expect(planHeading).toBeTruthy();
    expect(planBilling).toBeTruthy();
    expect((planHeading as HTMLElement).style.fontSize).toBe('');
    expect((planBilling as HTMLElement).style.fontSize).toBe('');
  });
});
