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
  const personaWinRateTrendCsvBlob = new Blob(['persona_id,bucket_start,win_rate'], {
    type: 'text/csv',
  });
  Object.defineProperty(personaWinRateTrendCsvBlob, 'text', {
    value: vi.fn().mockResolvedValue('persona_id,bucket_start,win_rate'),
  });
  const personaWinRateTrendJsonBlob = new Blob(['{"rows":[]}'], {
    type: 'application/json',
  });
  const personaWinRateTrendMarkdownBlob = new Blob(['# Arena — persona win-rate weekly trend'], {
    type: 'text/markdown',
  });
  Object.defineProperty(personaWinRateTrendMarkdownBlob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — persona win-rate weekly trend'),
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
  const activityJsonBlob = new Blob(['{"activity":[]}'], {
    type: 'application/json',
  });
  Object.defineProperty(activityJsonBlob, 'text', {
    value: vi.fn().mockResolvedValue('{"activity":[]}'),
  });
  const activityCsvBlob = new Blob(['date,prompts'], { type: 'text/csv' });
  Object.defineProperty(activityCsvBlob, 'text', {
    value: vi.fn().mockResolvedValue('date,prompts'),
  });
  const personaTimelineCsvExport = {
    blob: new Blob(['date,appearances,wins,win_rate'], { type: 'text/csv' }),
    filename: 'arena-timeline-analyst-2026-08-18-to-2026-08-20.csv',
  };
  Object.defineProperty(personaTimelineCsvExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('date,appearances,wins,win_rate'),
  });
  const personaTimelineJsonExport = {
    blob: new Blob(['{"persona_id":"analyst","timeline":[]}'], { type: 'application/json' }),
    filename: 'arena-timeline-analyst-2026-08-18-to-2026-08-20.json',
  };
  Object.defineProperty(personaTimelineJsonExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('{"persona_id":"analyst","timeline":[]}'),
  });
  const personaTimelineMarkdownExport = {
    blob: new Blob(['# Arena — The Analyst persona timeline'], { type: 'text/markdown' }),
    filename: 'arena-timeline-analyst-2026-08-18-to-2026-08-20.md',
  };
  Object.defineProperty(personaTimelineMarkdownExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — The Analyst persona timeline'),
  });
  const personaCategoryCsvExport = {
    blob: new Blob(['category,appearances,wins'], { type: 'text/csv' }),
    filename: 'arena-persona-category-analyst-2026-08-01-to-2026-08-30.csv',
  };
  const personaCategoryMarkdownExport = {
    blob: new Blob(['# Arena — The Analyst category breakdown'], { type: 'text/markdown' }),
    filename: 'arena-persona-category-analyst-2026-08-01-to-2026-08-30.md',
  };
  Object.defineProperty(personaCategoryMarkdownExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — The Analyst category breakdown'),
  });
  const personaStatsOverviewJsonExport = {
    blob: new Blob(['{"total_personas":16,"personas":[]}'], { type: 'application/json' }),
    filename: 'arena-persona-stats-overview-2026-08-01-to-2026-08-30.json',
  };
  Object.defineProperty(personaStatsOverviewJsonExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('{"total_personas":16,"personas":[]}'),
  });
  const personaStatsOverviewCsvExport = {
    blob: new Blob(['persona_id,name,appearances'], { type: 'text/csv' }),
    filename: 'arena-persona-stats-overview-2026-08-01-to-2026-08-30.csv',
  };
  Object.defineProperty(personaStatsOverviewCsvExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('persona_id,name,appearances'),
  });
  const personaStatsOverviewMarkdownExport = {
    blob: new Blob(['# Arena — persona stats overview'], { type: 'text/markdown' }),
    filename: 'arena-persona-stats-overview-2026-08-01-to-2026-08-30.md',
  };
  Object.defineProperty(personaStatsOverviewMarkdownExport.blob, 'text', {
    value: vi.fn().mockResolvedValue('# Arena — persona stats overview'),
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
  personaWinRateTrendCsvBlob,
  personaWinRateTrendJsonBlob,
  calibrationMarkdownBlob,
  categoryStatsMarkdownBlob,
  activityMarkdownBlob,
  activityJsonBlob,
  activityCsvBlob,
  personaTimelineCsvExport,
  personaTimelineJsonExport,
  personaTimelineMarkdownExport,
  personaStatsOverviewJsonExport,
  personaCategoryCsvExport,
  personaCategoryMarkdownExport,
  personaStatsOverviewCsvExport,
  personaStatsOverviewMarkdownExport,
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
    activityCsvBlob,
  ),
  exportAnalyticsActivityJson: vi.fn().mockResolvedValue({
    blob: activityJsonBlob,
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
  getAnalyticsPersonaStatsTimeline: vi.fn().mockResolvedValue({
    persona_id: 'analyst',
    name: 'The Analyst',
    days: 3,
    window_start: '2026-08-18',
    window_end: '2026-08-20',
    total_appearances: 3,
    total_wins: 2,
    best_day: '2026-08-19',
    best_day_wins: 1,
    best_day_appearances: 1,
    best_day_win_rate: 1,
    timeline: [
      { date: '2026-08-18', appearances: 1, wins: 0, win_rate: 0 },
      { date: '2026-08-19', appearances: 1, wins: 1, win_rate: 1 },
      { date: '2026-08-20', appearances: 1, wins: 1, win_rate: 1 },
    ],
  }),
  exportAnalyticsPersonaStatsTimelineCsv: vi.fn().mockResolvedValue(personaTimelineCsvExport),
  exportAnalyticsPersonaStatsTimelineJson: vi.fn().mockResolvedValue(personaTimelineJsonExport),
  exportAnalyticsPersonaStatsTimelineMarkdown: vi.fn().mockResolvedValue(personaTimelineMarkdownExport),
  exportAnalyticsPersonaStatsByCategoryCsv: vi.fn().mockResolvedValue(personaCategoryCsvExport),
  exportAnalyticsPersonaStatsByCategoryMarkdown: vi
    .fn()
    .mockResolvedValue(personaCategoryMarkdownExport),
  exportAnalyticsPersonaStatsOverviewCsv: vi.fn().mockResolvedValue(personaStatsOverviewCsvExport),
  exportAnalyticsPersonaStatsOverviewJson: vi.fn().mockResolvedValue(personaStatsOverviewJsonExport),
  exportAnalyticsPersonaStatsOverviewMarkdown: vi.fn().mockResolvedValue(personaStatsOverviewMarkdownExport),
  exportAnalyticsPersonaWinRateCsv: vi.fn().mockResolvedValue({
    blob: new Blob(['persona_id,name'], { type: 'text/csv' }),
    filename: 'arena-persona-win-rate-2026-07-13-to-2026-08-11.csv',
  }),
  exportAnalyticsPersonaWinRateTrendCsv: vi.fn().mockResolvedValue({
    blob: personaWinRateTrendCsvBlob,
    filename: 'arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.csv',
  }),
  exportAnalyticsPersonaWinRateTrendJson: vi.fn().mockResolvedValue({
    blob: personaWinRateTrendJsonBlob,
    filename: 'arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.json',
  }),
  exportAnalyticsPersonaWinRateTrendMarkdown: vi.fn().mockResolvedValue({
    blob: personaWinRateTrendMarkdownBlob,
    filename: 'arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.md',
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
  copyJsonToClipboard: vi.fn().mockResolvedValue(true),
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
  deleteCalibrationRating: vi.fn().mockResolvedValue({ status: 'deleted', taskId: 'task-x' }),
  getCapabilityUsage: vi.fn().mockResolvedValue({
    windowDays: 30,
    windowStart: '2026-07-25',
    windowEnd: '2026-08-23',
    totals: { agent: 0, web: 0, all: 0 },
    byMode: {},
    byCategory: [],
  }),
  getAgentCapabilities: vi.fn().mockResolvedValue([]),
  getCapabilityDoc: vi.fn().mockResolvedValue({
    id: 'arena.respond',
    description: '',
    execution: '',
    markdown: '',
  }),
  getCapabilityExamples: vi.fn().mockResolvedValue([]),
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
  searchMcpIntegration: vi.fn().mockResolvedValue([]),
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
  getAnalyticsPersonaStatsTimeline: hoistedMocks.getAnalyticsPersonaStatsTimeline,
  exportAnalyticsPersonaStatsByCategoryCsv: hoistedMocks.exportAnalyticsPersonaStatsByCategoryCsv,
  exportAnalyticsPersonaStatsByCategoryMarkdown:
    hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown,
  exportAnalyticsPersonaStatsOverviewCsv: hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv,
  exportAnalyticsPersonaStatsOverviewJson: hoistedMocks.exportAnalyticsPersonaStatsOverviewJson,
  exportAnalyticsPersonaStatsOverviewMarkdown: hoistedMocks.exportAnalyticsPersonaStatsOverviewMarkdown,
  exportAnalyticsPersonaStatsTimelineCsv: hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv,
  exportAnalyticsPersonaStatsTimelineJson: hoistedMocks.exportAnalyticsPersonaStatsTimelineJson,
  exportAnalyticsPersonaStatsTimelineMarkdown: hoistedMocks.exportAnalyticsPersonaStatsTimelineMarkdown,
  getCalibrationStats: hoistedMocks.getCalibrationStats,
  deleteCalibrationRating: hoistedMocks.deleteCalibrationRating,
  getCapabilityUsage: hoistedMocks.getCapabilityUsage,
  getAgentCapabilities: hoistedMocks.getAgentCapabilities,
  getCapabilityDoc: hoistedMocks.getCapabilityDoc,
  getCapabilityExamples: hoistedMocks.getCapabilityExamples,
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
  searchMcpIntegration: hoistedMocks.searchMcpIntegration,
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
  exportAnalyticsPersonaWinRateTrendCsv: hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv,
  exportAnalyticsPersonaWinRateTrendJson: hoistedMocks.exportAnalyticsPersonaWinRateTrendJson,
  exportAnalyticsPersonaWinRateTrendMarkdown: hoistedMocks.exportAnalyticsPersonaWinRateTrendMarkdown,
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
  copyJsonToClipboard: hoistedMocks.copyJsonToClipboard,
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
    vi.mocked(hoistedMocks.getAnalyticsPersonaStatsTimeline).mockClear();
    // mockReset (not mockClear) so an unconsumed mockRejectedValueOnce from an
    // earlier test cannot leak a one-shot failure into a later test's export.
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsByCategoryCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown)
      .mockReset()
      .mockResolvedValue(hoistedMocks.personaCategoryMarkdownExport);
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv)
      .mockReset()
      .mockResolvedValue(hoistedMocks.personaStatsOverviewCsvExport);
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsOverviewJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsOverviewMarkdown).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineMarkdown).mockClear();
    vi.mocked(hoistedMocks.getCalibrationHistory).mockClear();
    // Counted per-test: the delete flow re-reads stats exactly once more.
    vi.mocked(hoistedMocks.getCalibrationStats).mockClear();
    vi.mocked(hoistedMocks.deleteCalibrationRating).mockClear();
    vi.mocked(hoistedMocks.getCapabilityUsage).mockClear();
    vi.mocked(hoistedMocks.getAgentCapabilities).mockClear();
    vi.mocked(hoistedMocks.getCapabilityDoc).mockClear();
    vi.mocked(hoistedMocks.getCapabilityExamples).mockClear();
    vi.mocked(hoistedMocks.searchMcpIntegration).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateTrendJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateTrendMarkdown).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateJson).mockClear();
    vi.mocked(hoistedMocks.exportAnalyticsPersonaWinRateMarkdown).mockClear();
    // mockReset (not mockClear) so an unconsumed mockResolvedValueOnce from an
    // earlier test cannot leak a one-shot failure into a later test's copy.
    vi.mocked(hoistedMocks.copyToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(hoistedMocks.copyJsonToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(hoistedMocks.copyCsvToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(hoistedMocks.copyMarkdownToClipboard).mockReset().mockResolvedValue(true);
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

  it('copies the selected persona daily timeline as Markdown', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline markdown/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineMarkdown).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(hoistedMocks.copyMarkdownToClipboard).toHaveBeenCalledWith(
        '# Arena — The Analyst persona timeline',
      );
      expect(
        screen.getByText('Copied The Analyst daily timeline Markdown to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(copyButton).not.toBeDisabled();
  });

  it('copies the selected persona daily timeline as spreadsheet-aware CSV', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline csv/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith(
        'date,appearances,wins,win_rate',
      );
      expect(
        screen.getByText('Copied The Analyst daily timeline CSV to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(copyButton).not.toBeDisabled();
  });

  it('copies the selected persona daily timeline as structured JSON', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline json/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineJson).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(hoistedMocks.copyJsonToClipboard).toHaveBeenCalledWith(
        '{"persona_id":"analyst","timeline":[]}',
      );
      expect(
        screen.getByText('Copied The Analyst daily timeline JSON to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(copyButton).not.toBeDisabled();
  });

  it('does not start a duplicate persona timeline JSON copy while one is pending', async () => {
    let releaseExport: ((value: typeof hoistedMocks.personaTimelineJsonExport) => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaTimelineJsonExport>((resolve) => {
      releaseExport = resolve;
    });
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineJson).mockReturnValueOnce(pendingExport);

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline json/i,
    });

    await act(async () => {
      copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineJson).toHaveBeenCalledTimes(1);
    expect(copyButton).toBeDisabled();

    await act(async () => {
      releaseExport?.(hoistedMocks.personaTimelineJsonExport);
    });
    await waitFor(() => {
      expect(hoistedMocks.copyJsonToClipboard).toHaveBeenCalledWith(
        '{"persona_id":"analyst","timeline":[]}',
      );
      expect(copyButton).not.toBeDisabled();
    });
  });

  it('ignores a stale persona timeline CSV copy after the drill-down closes', async () => {
    let releaseExport: ((value: typeof hoistedMocks.personaTimelineCsvExport) => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaTimelineCsvExport>((resolve) => {
      releaseExport = resolve;
    });
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).mockReturnValueOnce(pendingExport);

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline csv/i,
    });
    fireEvent.click(copyButton);
    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(copyButton).toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /hide the analyst daily timeline/i }));
    await act(async () => {
      releaseExport?.(hoistedMocks.personaTimelineCsvExport);
    });

    expect(hoistedMocks.copyCsvToClipboard).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Copied The Analyst daily timeline CSV to the clipboard.'),
    ).not.toBeInTheDocument();
  });

  it('ignores a stale persona timeline CSV failure after the drill-down closes', async () => {
    let rejectExport: ((reason?: unknown) => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaTimelineCsvExport>((_, reject) => {
      rejectExport = reject;
    });
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).mockReturnValueOnce(pendingExport);

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline csv/i,
    });
    fireEvent.click(copyButton);
    await waitFor(() => expect(copyButton).toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: /hide the analyst daily timeline/i }));
    await act(async () => {
      rejectExport?.(new Error('late export failure'));
    });

    expect(
      screen.queryByText('Could not copy The Analyst daily timeline CSV — try again.'),
    ).not.toBeInTheDocument();
  });

  it('labels only the active persona timeline action while it is in progress', async () => {
    let releaseExport: (() => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaTimelineMarkdownExport>((resolve) => {
      releaseExport = () => resolve(hoistedMocks.personaTimelineMarkdownExport);
    });
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineMarkdown).mockReturnValueOnce(
      pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline markdown/i,
    });
    const csvButton = screen.getByRole('button', {
      name: /download the analyst daily timeline csv/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyButton).toHaveTextContent('⏳ Copying…');
      expect(copyButton).toHaveAttribute('aria-busy', 'true');
    });
    expect(csvButton).toHaveTextContent('Download CSV');
    expect(csvButton).toHaveAttribute('aria-busy', 'false');
    expect(csvButton).toBeDisabled();

    await act(async () => {
      releaseExport?.();
    });
    await waitFor(() => {
      expect(copyButton).not.toBeDisabled();
    });
  });

  it('surfaces persona timeline Markdown clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyMarkdownToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline markdown/i,
    });
    fireEvent.click(copyButton);

    expect(
      await screen.findByText('Could not copy The Analyst daily timeline Markdown — try again.'),
    ).toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it('surfaces persona timeline CSV clipboard failures and releases the copy lock', async () => {
    vi.mocked(hoistedMocks.copyCsvToClipboard).mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline csv/i,
    });
    fireEvent.click(copyButton);

    expect(
      await screen.findByText('Could not copy The Analyst daily timeline CSV — try again.'),
    ).toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it('surfaces persona timeline JSON clipboard failures and releases the copy lock', async () => {
    vi.mocked(hoistedMocks.copyJsonToClipboard).mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const copyButton = await screen.findByRole('button', {
      name: /copy the analyst daily timeline json/i,
    });
    fireEvent.click(copyButton);

    expect(
      await screen.findByText('Could not copy The Analyst daily timeline JSON — try again.'),
    ).toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
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

  it('surfaces activity JSON download failures and releases the export lock', async () => {
    hoistedMocks.exportAnalyticsActivityJson.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🗓️ activity json export$/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download activity JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces a blocked activity JSON download and releases the export lock', async () => {
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🗓️ activity json export$/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download activity JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('copies analytics activity JSON for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /activity highlights window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy activity json/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityJson).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('{"activity":[]}');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied activity JSON to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces activity JSON clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy activity json/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy activity JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
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

  it('surfaces activity Markdown download failures and releases the export lock', async () => {
    hoistedMocks.exportAnalyticsActivityMarkdown.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🗓️ activity markdown export$/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download activity Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces a blocked activity Markdown download and releases the export lock', async () => {
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🗓️ activity markdown export$/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download activity Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('copies analytics activity CSV for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /activity highlights window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy activity csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityCsv).toHaveBeenCalledWith(90);
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith('date,prompts');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied activity CSV to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('locks the activity window while activity CSV is being copied', async () => {
    let resolveExport: ((value: Blob) => void) | undefined;
    const pendingExport = new Promise<Blob>((resolve) => {
      resolveExport = resolve;
    });
    hoistedMocks.exportAnalyticsActivityCsv.mockImplementationOnce(() => pendingExport);

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /activity highlights window/i,
    });
    const copyButton = await screen.findByRole('button', { name: /copy activity csv/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsActivityCsv).toHaveBeenCalledWith(30);
    });
    expect(windowSelect).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');

    resolveExport?.(hoistedMocks.activityCsvBlob);
    await waitFor(() => {
      expect(windowSelect).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('surfaces activity CSV clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyCsvToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy activity csv/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy activity CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
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

  it('copies persona win-rate CSV with the selected filters', async () => {
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

    const csvBlob = new Blob(['persona_id,name\nanalyst,The Analyst\n'], { type: 'text/csv' });
    Object.defineProperty(csvBlob, 'text', {
      value: vi.fn().mockResolvedValue('persona_id,name\nanalyst,The Analyst\n'),
    });
    hoistedMocks.exportAnalyticsPersonaWinRateCsv.mockResolvedValueOnce({
      blob: csvBlob,
      filename: 'arena-persona-win-rate-2026-08-11-to-2026-08-17.csv',
    });

    const button = await screen.findByRole('button', { name: /copy win rates csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateCsv).toHaveBeenCalledWith(7, 5, true);
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith(
        'persona_id,name\nanalyst,The Analyst\n',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied persona win-rate CSV to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona win-rate CSV clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyCsvToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy win rates csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Could not copy persona win-rate CSV — try again.')).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
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

  it('copies the selected persona win-rate JSON report with its filters', async () => {
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

    const jsonBlob = new Blob(['{"window_days":7,"personas":[]}'], {
      type: 'application/json',
    });
    Object.defineProperty(jsonBlob, 'text', {
      value: vi.fn().mockResolvedValue('{"window_days":7,"personas":[]}'),
    });
    hoistedMocks.exportAnalyticsPersonaWinRateJson.mockResolvedValueOnce({
      blob: jsonBlob,
      filename: 'arena-persona-win-rate-2026-08-11-to-2026-08-17.json',
    });

    const button = await screen.findByRole('button', { name: /copy win rates json/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateJson).toHaveBeenCalledWith(7, 5, true);
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('{"window_days":7,"personas":[]}');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copied persona win-rate JSON to the clipboard.',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona win-rate JSON clipboard failures and releases the copy lock', async () => {
    hoistedMocks.copyToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy win rates json/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Could not copy persona win-rate JSON — try again.')).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
  });

  it('locks persona win-rate export filters while JSON is being copied', async () => {
    let resolveExport: ((value: { blob: Blob; filename: string }) => void) | undefined;
    const pendingExport = new Promise<{ blob: Blob; filename: string }>((resolve) => {
      resolveExport = resolve;
    });
    hoistedMocks.exportAnalyticsPersonaWinRateJson.mockImplementationOnce(
      () => pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /persona win-rate window/i,
    });
    const minimumSelect = await screen.findByRole('combobox', {
      name: /persona win-rate minimum appearances/i,
    });
    const fallbackCheckbox = await screen.findByRole('checkbox', {
      name: /include fallback scorings/i,
    });
    const copyButton = await screen.findByRole('button', { name: /copy win rates json/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateJson).toHaveBeenCalledWith(30, 1, false);
    });
    expect(windowSelect).toBeDisabled();
    expect(minimumSelect).toBeDisabled();
    expect(fallbackCheckbox).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');

    resolveExport?.({
      blob: hoistedMocks.summaryJsonBlob,
      filename: 'arena-persona-win-rate-2026-07-13-to-2026-08-11.json',
    });
    await waitFor(() => {
      expect(windowSelect).not.toBeDisabled();
      expect(minimumSelect).not.toBeDisabled();
      expect(fallbackCheckbox).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
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

  const historyRating = {
    id: 11,
    task_id: 'task-history-1',
    user_rating: 4,
    system_score: 95,
    delta: 15,
    verdict: 'You underestimated this answer',
    created_at: '2026-08-11T10:00:00Z',
  };

  async function openHistoryWithRatings() {
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 6,
      avg_delta: 2.0,
      trend: 'stable',
      calibration_score: 92,
      recent_ratings: [{ delta: 5, created_at: '2026-08-11T10:00:00Z' }],
    });
    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [historyRating],
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
    return await screen.findByRole('region', { name: /calibration history/i });
  }

  it('arms a confirm before deleting a calibration rating and sends nothing first', async () => {
    const history = await openHistoryWithRatings();

    within(history)
      .getByRole('button', {
        name: /delete calibration rating for task task-history-1/i,
      })
      .click();

    // Arming destroys nothing.
    expect(await within(history).findByText('Delete forever?')).toBeInTheDocument();
    expect(
      within(history).getByRole('button', {
        name: /confirm deleting rating for task task-history-1/i,
      }),
    ).toBeInTheDocument();
    expect(hoistedMocks.deleteCalibrationRating).not.toHaveBeenCalled();

    // Keep backs out; the plain Delete button returns.
    within(history)
      .getByRole('button', { name: /keep rating for task task-history-1/i })
      .click();
    expect(
      await within(history).findByRole('button', {
        name: /delete calibration rating for task task-history-1/i,
      }),
    ).toBeInTheDocument();
    expect(within(history).queryByText('Delete forever?')).not.toBeInTheDocument();
    expect(hoistedMocks.deleteCalibrationRating).not.toHaveBeenCalled();
  });

  it('deletes a rating after confirm, removing the row and recalibrating stats', async () => {
    const history = await openHistoryWithRatings();
    // Second stats read fires once the delete lands and the tick bumps.
    hoistedMocks.getCalibrationStats.mockResolvedValueOnce({
      total_ratings: 5,
      avg_delta: 2.0,
      trend: 'stable',
      calibration_score: 92,
      recent_ratings: [],
    });

    within(history)
      .getByRole('button', { name: /delete calibration rating for task task-history-1/i })
      .click();
    const confirm = await within(history).findByRole('button', {
      name: /confirm deleting rating for task task-history-1/i,
    });
    confirm.click();

    await waitFor(() => {
      expect(hoistedMocks.deleteCalibrationRating).toHaveBeenCalledWith('task-history-1');
      expect(
        within(history).queryByText('You underestimated this answer'),
      ).not.toBeInTheDocument();
    });
    // The stats panel recalibrates after the server accepts the delete.
    await waitFor(() => {
      expect(hoistedMocks.getCalibrationStats).toHaveBeenCalledTimes(2);
    });
  });

  it('surfaces a delete refusal verbatim and keeps the row', async () => {
    hoistedMocks.deleteCalibrationRating.mockRejectedValueOnce(
      new Error('Too many calibration deletes. Limit is 60 per hour.'),
    );
    const history = await openHistoryWithRatings();

    within(history)
      .getByRole('button', { name: /delete calibration rating for task task-history-1/i })
      .click();
    const confirm = await within(history).findByRole('button', {
      name: /confirm deleting rating for task task-history-1/i,
    });
    confirm.click();

    expect(await within(history).findByRole('alert')).toHaveTextContent(
      'Too many calibration deletes. Limit is 60 per hour.',
    );
    expect(within(history).getByText('You underestimated this answer')).toBeInTheDocument();
  });

  it('falls back a page when a delete empties the tail page', async () => {
    const history = await openHistoryWithRatings();
    // Page 2 holds this rating and nothing else: deleting it leaves no
    // page 2 server-side, so the view must drop back to page 1.
    hoistedMocks.getCalibrationHistory.mockResolvedValueOnce({
      ratings: [historyRating],
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

    within(history)
      .getByRole('button', { name: /delete calibration rating for task task-history-1/i })
      .click();
    const confirm = await within(history).findByRole('button', {
      name: /confirm deleting rating for task task-history-1/i,
    });
    confirm.click();

    await waitFor(() => {
      expect(hoistedMocks.deleteCalibrationRating).toHaveBeenCalledWith('task-history-1');
      expect(hoistedMocks.getCalibrationHistory).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 5,
        sort: 'newest',
      });
    });
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

  it('downloads the persona stats overview as JSON', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /^🤖 persona stats json$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewJson).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaStatsOverviewJsonExport.blob,
        'arena-persona-stats-overview-2026-08-01-to-2026-08-30.json',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('downloads the persona stats overview as Markdown', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /^🤖 persona stats markdown$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewMarkdown).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaStatsOverviewMarkdownExport.blob,
        'arena-persona-stats-overview-2026-08-01-to-2026-08-30.md',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('downloads the persona stats overview as CSV', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /^🤖 persona stats csv$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv).toHaveBeenCalledWith(30);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaStatsOverviewCsvExport.blob,
        'arena-persona-stats-overview-2026-08-01-to-2026-08-30.csv',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona stats CSV download failures and releases the export lock', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /^🤖 persona stats csv$/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download persona stats CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces a blocked persona stats CSV download and releases the export lock', async () => {
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /^🤖 persona stats csv$/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download persona stats CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('labels only the active persona stats overview download while it is in progress', async () => {
    let releaseExport: (() => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaStatsOverviewJsonExport>(
      (resolve) => {
        releaseExport = () => resolve(hoistedMocks.personaStatsOverviewJsonExport);
      },
    );
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsOverviewJson).mockReturnValueOnce(
      pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const jsonButton = await screen.findByRole('button', { name: /^🤖 persona stats json$/i });
    const markdownButton = screen.getByRole('button', { name: /^🤖 persona stats markdown$/i });
    fireEvent.click(jsonButton);

    await waitFor(() => {
      expect(jsonButton).toHaveTextContent('⏳ Downloading…');
      expect(jsonButton).toHaveAttribute('aria-busy', 'true');
    });
    expect(markdownButton).toHaveTextContent('🤖 Persona Stats Markdown');
    expect(markdownButton).toHaveAttribute('aria-busy', 'false');
    expect(markdownButton).toBeDisabled();

    await act(async () => {
      releaseExport?.();
    });
    await waitFor(() => {
      expect(jsonButton).not.toBeDisabled();
      expect(jsonButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('copies the persona stats overview as spreadsheet-aware CSV', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv).toHaveBeenCalledWith(30);
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith(
        'persona_id,name,appearances',
      );
      expect(
        screen.getByText('Copied persona stats CSV to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
  });

  it('copies the persona stats overview CSV for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona stats overview window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy persona stats csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv).toHaveBeenCalledWith(90);
      expect(
        screen.getByText('Copied persona stats CSV to the clipboard.'),
      ).toBeInTheDocument();
    });
  });

  it('downloads the persona stats overview JSON for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona stats overview window/i }),
      { target: { value: '365' } },
    );
    const button = await screen.findByRole('button', { name: /^🤖 persona stats json$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewJson).toHaveBeenCalledWith(365);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaStatsOverviewJsonExport.blob,
        'arena-persona-stats-overview-2026-08-01-to-2026-08-30.json',
      );
    });
  });

  it('surfaces persona stats CSV clipboard failures and releases the copy lock', async () => {
    vi.mocked(hoistedMocks.copyCsvToClipboard).mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats csv/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy persona stats CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona stats CSV copy fetch failures and releases the copy lock', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsOverviewCsv.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats csv/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy persona stats CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('copies the persona stats overview as Markdown for notes and docs', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats markdown/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewMarkdown).toHaveBeenCalledWith(30);
      expect(hoistedMocks.copyMarkdownToClipboard).toHaveBeenCalledWith(
        '# Arena — persona stats overview',
      );
      expect(
        screen.getByText('Copied persona stats Markdown to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
  });

  it('copies the persona stats overview Markdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona stats overview window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy persona stats markdown/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewMarkdown).toHaveBeenCalledWith(90);
      expect(
        screen.getByText('Copied persona stats Markdown to the clipboard.'),
      ).toBeInTheDocument();
    });
  });

  it('surfaces persona stats Markdown clipboard failures and releases the copy lock', async () => {
    vi.mocked(hoistedMocks.copyMarkdownToClipboard).mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats markdown/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy persona stats Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona stats Markdown copy fetch failures and releases the copy lock', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsOverviewMarkdown.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats markdown/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy persona stats Markdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('downloads the persona category breakdown as CSV from the drill-down', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /category breakdown csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsByCategoryCsv).toHaveBeenCalledWith(
        'analyst',
        30,
      );
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaCategoryCsvExport.blob,
        'arena-persona-category-analyst-2026-08-01-to-2026-08-30.csv',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('downloads the persona category breakdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona stats overview window/i }),
      { target: { value: '90' } },
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /category breakdown csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsByCategoryCsv).toHaveBeenCalledWith(
        'analyst',
        90,
      );
    });
  });

  it('surfaces persona category breakdown download failures and releases the export lock', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsByCategoryCsv.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /category breakdown csv/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download The Analyst category breakdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('labels the persona category breakdown as busy only while its export is in flight', async () => {
    let releaseExport: (() => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaCategoryCsvExport>((resolve) => {
      releaseExport = () => resolve(hoistedMocks.personaCategoryCsvExport);
    });
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsByCategoryCsv).mockReturnValueOnce(
      pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /category breakdown csv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent('⏳ Exporting…');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    await act(async () => {
      releaseExport?.();
    });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveTextContent('Category Breakdown CSV');
    });
  });

  it('downloads the persona category breakdown as Markdown from the drill-down', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /^category breakdown markdown$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown).toHaveBeenCalledWith(
        'analyst',
        30,
      );
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaCategoryMarkdownExport.blob,
        'arena-persona-category-analyst-2026-08-01-to-2026-08-30.md',
      );
    });
    expect(button).not.toBeDisabled();
  });

  it('downloads the persona category Markdown breakdown for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona stats overview window/i }),
      { target: { value: '365' } },
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /^category breakdown markdown$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown).toHaveBeenCalledWith(
        'analyst',
        365,
      );
    });
  });

  it('surfaces persona category Markdown download failures and releases the export lock', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown.mockRejectedValueOnce(
      new Error('boom'),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /^category breakdown markdown$/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download The Analyst category breakdown — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('labels the persona category Markdown breakdown as busy only while its export is in flight', async () => {
    let releaseExport: (() => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaCategoryMarkdownExport>(
      (resolve) => {
        releaseExport = () => resolve(hoistedMocks.personaCategoryMarkdownExport);
      },
    );
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown).mockReturnValueOnce(
      pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', { name: /^category breakdown markdown$/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent('⏳ Exporting…');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    await act(async () => {
      releaseExport?.();
    });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveTextContent('Category Breakdown Markdown');
    });
  });

  it('copies the persona category breakdown Markdown to the clipboard', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', {
      name: /copy category breakdown markdown/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown).toHaveBeenCalledWith(
        'analyst',
        30,
      );
      expect(hoistedMocks.copyMarkdownToClipboard).toHaveBeenCalledWith(
        '# Arena — The Analyst category breakdown',
      );
      expect(
        screen.getByText('Copied The Analyst category breakdown Markdown to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona category Markdown copy failures honestly', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown.mockRejectedValueOnce(
      new Error('boom'),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', {
      name: /copy category breakdown markdown/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText(
        'Could not copy The Analyst category breakdown Markdown — try again.',
      ),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('labels the category Markdown copy as busy only while it is in flight', async () => {
    let releaseExport: (() => void) | undefined;
    const pendingExport = new Promise<typeof hoistedMocks.personaCategoryMarkdownExport>(
      (resolve) => {
        releaseExport = () => resolve(hoistedMocks.personaCategoryMarkdownExport);
      },
    );
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsByCategoryMarkdown).mockReturnValueOnce(
      pendingExport,
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(
      await screen.findByRole('button', { name: /show the analyst daily timeline/i }),
    );
    const button = await screen.findByRole('button', {
      name: /copy category breakdown markdown/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent('⏳ Copying…');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    await act(async () => {
      releaseExport?.();
    });
    await waitFor(() => {
      expect(hoistedMocks.copyMarkdownToClipboard).toHaveBeenCalledWith(
        '# Arena — The Analyst category breakdown',
      );
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveTextContent('Copy Category Breakdown Markdown');
    });
  });

  it('copies the persona stats overview as structured JSON', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats json/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewJson).toHaveBeenCalledWith(30);
      expect(hoistedMocks.copyJsonToClipboard).toHaveBeenCalledWith(
        '{"total_personas":16,"personas":[]}',
      );
      expect(
        screen.getByText('Copied persona stats JSON to the clipboard.'),
      ).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
  });

  it('copies the persona stats overview JSON for the selected window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.change(
      await screen.findByRole('combobox', { name: /persona stats overview window/i }),
      { target: { value: '90' } },
    );
    const button = await screen.findByRole('button', { name: /copy persona stats json/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsOverviewJson).toHaveBeenCalledWith(90);
      expect(
        screen.getByText('Copied persona stats JSON to the clipboard.'),
      ).toBeInTheDocument();
    });
  });

  it('surfaces persona stats JSON clipboard failures and releases the copy lock', async () => {
    vi.mocked(hoistedMocks.copyJsonToClipboard).mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats json/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy persona stats JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces persona stats JSON copy fetch failures and releases the copy lock', async () => {
    hoistedMocks.exportAnalyticsPersonaStatsOverviewJson.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', { name: /copy persona stats json/i });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not copy persona stats JSON — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
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

  it('surfaces activity CSV download failures and releases the export lock', async () => {
    hoistedMocks.exportAnalyticsActivityCsv.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🗓️ activity export · 30d$/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download activity CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('surfaces a blocked activity CSV download and releases the export lock', async () => {
    vi.mocked(downloadBlobFile).mockReturnValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const button = await screen.findByRole('button', {
      name: /^🗓️ activity export · 30d$/i,
    });
    fireEvent.click(button);

    expect(
      await screen.findByText('Could not download activity CSV — try again.'),
    ).toBeInTheDocument();
    expect(button).not.toBeDisabled();
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

  it('renders capability usage bars from the live endpoint', async () => {
    hoistedMocks.getCapabilityUsage.mockResolvedValueOnce({
      windowDays: 30,
      windowStart: '2026-07-25',
      windowEnd: '2026-08-23',
      totals: { agent: 12, web: 5, all: 17 },
      byMode: { arena: 5, agent: 12, debate: 0, discuss: 0, other: 2 },
      byCategory: [
        { category: 'coding', count: 12 },
        { category: 'research', count: 5 },
      ],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /capability usage/i });
    // totals.all is 17 but the mode split sums to 19 — the headline
    // counts every call, including the two 'other'-mode ones.
    expect(within(group).getByText(/19 calls in window/)).toBeInTheDocument();
    expect(within(group).getByText('12 agent')).toBeInTheDocument();
    expect(within(group).getByText('5 arena')).toBeInTheDocument();
    expect(within(group).getByText('2 other')).toBeInTheDocument();
    expect(within(group).queryByText('0 debate')).not.toBeInTheDocument();
    expect(within(group).getByRole('img', { name: 'coding: 12 calls' })).toBeInTheDocument();
    expect(within(group).getByText('coding')).toBeInTheDocument();
    expect(within(group).getByText('12 calls')).toBeInTheDocument();
    expect(within(group).getByText('research')).toBeInTheDocument();
    expect(within(group).getByText('5 calls')).toBeInTheDocument();
    expect(hoistedMocks.getCapabilityUsage).toHaveBeenCalledWith(30);
  });

  it('refreshes capability usage with its window', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /capability usage window/i,
    });
    fireEvent.change(windowSelect, { target: { value: '7' } });

    await waitFor(() => {
      expect(hoistedMocks.getCapabilityUsage).toHaveBeenLastCalledWith(7);
      expect(screen.getByText('Capability usage · 7 days')).toBeInTheDocument();
    });
  });

  it('retries capability usage after a failed load', async () => {
    hoistedMocks.getCapabilityUsage.mockRejectedValueOnce(
      new Error('Too many capability-usage requests. Limit is 60 per hour.'),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText(
        'Too many capability-usage requests. Limit is 60 per hour.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /retry loading capability usage/i }),
    );

    expect(
      await screen.findByText('No Agent calls recorded in the last 30 days yet.'),
    ).toBeInTheDocument();
    expect(hoistedMocks.getCapabilityUsage).toHaveBeenCalledTimes(2);
  });

  const referenceCaps = [
    { id: 'arena.respond', description: 'Four-agent panel response.', execution: 'local' },
    { id: 'file.organize', description: 'Organize files into folders.', execution: 'server' },
  ];

  it('lists the capability taxonomy when the reference opens', async () => {
    hoistedMocks.getAgentCapabilities.mockResolvedValueOnce(referenceCaps);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    (
      await screen.findByRole('button', { name: /view capability reference/i })
    ).click();

    const region = await screen.findByRole('region', { name: /capability reference/i });
    expect(within(region).getByText('arena.respond')).toBeInTheDocument();
    expect(within(region).getByText('Four-agent panel response.')).toBeInTheDocument();
    expect(within(region).getByText('file.organize')).toBeInTheDocument();
    expect(within(region).getByText('server')).toBeInTheDocument();
    expect(hoistedMocks.getAgentCapabilities).toHaveBeenCalledTimes(1);
  });

  it('fetches a doc once on expand and keeps it cached across collapse', async () => {
    hoistedMocks.getAgentCapabilities.mockResolvedValueOnce(referenceCaps);
    hoistedMocks.getCapabilityDoc.mockResolvedValueOnce({
      id: 'arena.respond',
      description: 'Four-agent panel response.',
      execution: 'local',
      markdown: '**Four-agent panel response.**\n\nDetails here.',
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    (
      await screen.findByRole('button', { name: /view capability reference/i })
    ).click();
    const region = await screen.findByRole('region', { name: /capability reference/i });

    within(region)
      .getByRole('button', { name: /expand capability arena\.respond/i })
      .click();
    // Markdown renders structured: the bold lead is a real <strong>,
    // not literal asterisks in a pre block.
    expect(
      await within(region).findByText('Four-agent panel response.', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(within(region).getByText(/Details here/)).toBeInTheDocument();
    expect(within(region).queryByText(/\*\*/)).not.toBeInTheDocument();
    expect(hoistedMocks.getCapabilityDoc).toHaveBeenCalledTimes(1);

    // Collapse, then re-expand: the cached doc renders with no refetch.
    within(region)
      .getByRole('button', { name: /collapse capability arena\.respond/i })
      .click();
    // Await the collapsed state before asserting absence, so the
    // assertion can't outrun React's flush.
    await waitFor(() => {
      expect(
        within(region).getByRole('button', { name: /expand capability arena\.respond/i }),
      ).toBeInTheDocument();
    });
    expect(
      within(region).queryByText('Four-agent panel response.', { selector: 'strong' }),
    ).not.toBeInTheDocument();
    within(region)
      .getByRole('button', { name: /expand capability arena\.respond/i })
      .click();
    expect(
      await within(region).findByText('Four-agent panel response.', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(hoistedMocks.getCapabilityDoc).toHaveBeenCalledTimes(1);
  });

  it('renders headings, bullets, and code spans from a doc', async () => {
    hoistedMocks.getAgentCapabilities.mockResolvedValueOnce(referenceCaps);
    hoistedMocks.getCapabilityDoc.mockResolvedValueOnce({
      id: 'arena.respond',
      description: 'Four-agent panel response.',
      execution: 'local',
      markdown:
        '## Notes\n\n- First item\n- Second item\n\nRun `arena.respond` locally.',
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    (
      await screen.findByRole('button', { name: /view capability reference/i })
    ).click();
    const region = await screen.findByRole('region', { name: /capability reference/i });

    within(region)
      .getByRole('button', { name: /expand capability arena\.respond/i })
      .click();

    const docRegion = await within(region).findByText('Notes');
    expect(docRegion.tagName).toBe('DIV');
    expect(within(region).getByText('First item').tagName).toBe('LI');
    expect(within(region).getByText('Second item').tagName).toBe('LI');
    // The id row also reads "arena.respond", so pin the code span by tag.
    expect(within(region).getByText('arena.respond', { selector: 'code' })).toBeInTheDocument();
  });

  it('shows try-it prompts with a copy button that flashes confirmation', async () => {
    hoistedMocks.getAgentCapabilities.mockResolvedValueOnce(referenceCaps);
    hoistedMocks.getCapabilityExamples.mockResolvedValueOnce([
      { id: 'arena.respond', examples: ['Debate this topic', 'Summarize the news'] },
      { id: 'file.organize', examples: [] },
    ]);
    hoistedMocks.getCapabilityDoc.mockResolvedValueOnce({
      id: 'arena.respond',
      description: 'Four-agent panel response.',
      execution: 'local',
      markdown: '**Four-agent panel response.**',
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    (
      await screen.findByRole('button', { name: /view capability reference/i })
    ).click();
    const region = await screen.findByRole('region', { name: /capability reference/i });

    within(region)
      .getByRole('button', { name: /expand capability arena\.respond/i })
      .click();

    expect(await within(region).findByText('Try it')).toBeInTheDocument();
    const promptSpan = within(region).getByText('“Debate this topic”');
    // Prompts wrap so the whole text is readable — never ellipsized.
    expect(promptSpan.getAttribute('style') ?? '').not.toContain('ellipsis');
    expect(promptSpan.getAttribute('style') ?? '').not.toContain('nowrap');

    const copyButton = within(region).getByRole('button', {
      name: /copy example prompt 1 for capability arena\.respond/i,
    });
    // The Copied flash announces itself to assistive tech.
    expect(copyButton).toHaveAttribute('aria-live', 'polite');
    copyButton.click();
    await waitFor(() => {
      expect(hoistedMocks.copyToClipboard).toHaveBeenCalledWith('Debate this topic');
    });
    expect(await within(region).findByText('Copied')).toBeInTheDocument();

    // A capability with no curated examples stays quiet: the reference
    // is one-open-at-a-time, so switching rows collapses this one.
    within(region)
      .getByRole('button', { name: /expand capability file\.organize/i })
      .click();
    await waitFor(() => {
      expect(
        within(region).getByRole('button', { name: /expand capability arena\.respond/i }),
      ).toBeInTheDocument();
    });
    expect(
      within(region).queryByRole('button', {
        name: /copy example prompt .*for capability file\.organize/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('admits when example prompts fail without blocking the docs', async () => {
    hoistedMocks.getAgentCapabilities.mockResolvedValueOnce(referenceCaps);
    hoistedMocks.getCapabilityExamples.mockRejectedValueOnce(
      new Error('Too many capability-example lookups. Please slow down.'),
    );
    hoistedMocks.getCapabilityDoc.mockResolvedValueOnce({
      id: 'arena.respond',
      description: 'Four-agent panel response.',
      execution: 'local',
      markdown: '**Four-agent panel response.**',
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    (
      await screen.findByRole('button', { name: /view capability reference/i })
    ).click();
    const region = await screen.findByRole('region', { name: /capability reference/i });

    within(region)
      .getByRole('button', { name: /expand capability arena\.respond/i })
      .click();

    // The doc still renders…
    expect(
      await within(region).findByText('Four-agent panel response.', { selector: 'strong' }),
    ).toBeInTheDocument();
    // …and the missing garnish says so.
    expect(
      await within(region).findByText('Example prompts are unavailable right now.'),
    ).toBeInTheDocument();
    expect(within(region).queryByText('Try it')).not.toBeInTheDocument();
  });

  const connectedNotion = {
    id: 7,
    service: 'notion',
    is_active: true,
    connected_at: '2026-08-20T10:00:00Z',
  };

  async function openIntegrationTestSearch() {
    // getMcpIntegrations resolves to the row array itself.
    hoistedMocks.getMcpIntegrations.mockResolvedValueOnce([connectedNotion]);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    (
      await screen.findByRole('button', { name: /^integrations$/i })
    ).click();
    (
      await screen.findByRole('button', { name: /test search notion/i })
    ).click();
    return await screen.findByRole('region', { name: /test search for notion/i });
  }

  it('runs a live test search against a connected integration', async () => {
    hoistedMocks.searchMcpIntegration.mockResolvedValueOnce([
      {
        title: 'Launch checklist',
        excerpt: 'Final pre-flight items',
        source: 'Notion',
        url: 'https://notion.so/launch',
      },
    ]);
    const region = await openIntegrationTestSearch();

    fireEvent.change(
      await within(region).findByRole('textbox', { name: /search query for notion/i }),
      { target: { value: 'launch' } },
    );
    within(region).getByRole('button', { name: 'Search' }).click();

    const link = await within(region).findByRole('link', { name: 'Launch checklist' });
    expect(link).toHaveAttribute('href', 'https://notion.so/launch');
    expect(within(region).getByText('Final pre-flight items')).toBeInTheDocument();
    expect(hoistedMocks.searchMcpIntegration).toHaveBeenCalledWith(7, 'launch');
  });

  it('surfaces a test-search refusal verbatim and keeps the form', async () => {
    hoistedMocks.searchMcpIntegration.mockRejectedValueOnce(
      new Error('Too many integration searches. Please try again later.'),
    );
    const region = await openIntegrationTestSearch();

    fireEvent.change(
      await within(region).findByRole('textbox', { name: /search query for notion/i }),
      { target: { value: 'launch' } },
    );
    within(region).getByRole('button', { name: 'Search' }).click();

    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'Too many integration searches. Please try again later.',
    );
    expect(
      within(region).getByRole('textbox', { name: /search query for notion/i }),
    ).toBeInTheDocument();
  });

  it('reports an empty result set as exactly that', async () => {
    hoistedMocks.searchMcpIntegration.mockResolvedValueOnce([]);
    const region = await openIntegrationTestSearch();

    fireEvent.change(
      await within(region).findByRole('textbox', { name: /search query for notion/i }),
      { target: { value: 'nothing-matches-this' } },
    );
    within(region).getByRole('button', { name: 'Search' }).click();

    expect(await within(region).findByText('No results returned.')).toBeInTheDocument();
  });

  it('skips URL-duplicated excerpts and never links non-http urls', async () => {
    hoistedMocks.searchMcpIntegration.mockResolvedValueOnce([
      {
        // Notion echoes its own URL as the excerpt — the row must not print it twice.
        title: 'Dup checklist',
        excerpt: 'https://notion.so/dup',
        source: 'Notion',
        url: 'https://notion.so/dup',
      },
      {
        // Vendor payloads never become javascript:/data: hrefs.
        title: 'Odd entry',
        excerpt: '',
        source: 'Notion',
        url: 'javascript:alert(1)',
      },
    ]);
    const region = await openIntegrationTestSearch();

    fireEvent.change(
      await within(region).findByRole('textbox', { name: /search query for notion/i }),
      { target: { value: 'dup' } },
    );
    within(region).getByRole('button', { name: 'Search' }).click();

    const dupLink = await within(region).findByRole('link', { name: 'Dup checklist' });
    expect(dupLink).toHaveAttribute('href', 'https://notion.so/dup');
    expect(
      within(region).queryByText('https://notion.so/dup', { selector: 'p' }),
    ).not.toBeInTheDocument();

    expect(within(region).queryByRole('link', { name: 'Odd entry' })).not.toBeInTheDocument();
    expect(within(region).getByText('Odd entry')).toBeInTheDocument();

    // The region announces its busy state for screen readers.
    expect(region).toHaveAttribute('aria-busy', 'false');
  });

  it('surfaces a doc refusal verbatim inside its row', async () => {
    hoistedMocks.getAgentCapabilities.mockResolvedValueOnce(referenceCaps);
    hoistedMocks.getCapabilityDoc.mockRejectedValueOnce(
      new Error('Too many capability-doc lookups. Please slow down.'),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    (
      await screen.findByRole('button', { name: /view capability reference/i })
    ).click();
    const region = await screen.findByRole('region', { name: /capability reference/i });

    within(region)
      .getByRole('button', { name: /expand capability file\.organize/i })
      .click();

    expect(
      await within(region).findByText(
        'Too many capability-doc lookups. Please slow down.',
      ),
    ).toBeInTheDocument();
    // The taxonomy row itself survives; only the doc failed.
    expect(within(region).getByText('file.organize')).toBeInTheDocument();
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

  it('opens a daily activity drill-down for a persona', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const detailsButton = await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    });
    fireEvent.click(detailsButton);

    expect(hoistedMocks.getAnalyticsPersonaStatsTimeline).toHaveBeenCalledWith('analyst', 30);
    expect(
      await screen.findByRole('region', { name: 'The Analyst daily activity timeline' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 wins / 3 appearances in 3 days')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /2026-08-20: 1 win/ })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Wins exclude fallback scorings; appearances include every panel appearance.',
    );
    expect(detailsButton).toHaveAttribute('aria-controls', 'persona-timeline-analyst');
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('downloads the expanded persona daily timeline as CSV', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    }));
    await screen.findByRole('region', { name: 'The Analyst daily activity timeline' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Download The Analyst daily timeline CSV',
    }));

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaTimelineCsvExport.blob,
        hoistedMocks.personaTimelineCsvExport.filename,
      );
    });
  });

  it('downloads the expanded persona daily timeline as JSON', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    }));
    await screen.findByRole('region', { name: 'The Analyst daily activity timeline' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Download The Analyst daily timeline JSON',
    }));

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineJson).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaTimelineJsonExport.blob,
        hoistedMocks.personaTimelineJsonExport.filename,
      );
    });
  });

  it('downloads the expanded persona daily timeline as Markdown', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    }));
    await screen.findByRole('region', { name: 'The Analyst daily activity timeline' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Download The Analyst daily timeline Markdown',
    }));

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaStatsTimelineMarkdown).toHaveBeenCalledWith(
        'analyst',
        3,
      );
      expect(downloadBlobFile).toHaveBeenCalledWith(
        hoistedMocks.personaTimelineMarkdownExport.blob,
        hoistedMocks.personaTimelineMarkdownExport.filename,
      );
    });
  });

  it('surfaces persona timeline CSV failures and releases the download lock', async () => {
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineCsv).mockRejectedValueOnce(
      new Error('boom'),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    }));
    await screen.findByRole('region', { name: 'The Analyst daily activity timeline' });

    const exportButton = screen.getByRole('button', {
      name: 'Download The Analyst daily timeline CSV',
    });
    fireEvent.click(exportButton);

    expect(
      await screen.findByText('Could not download persona timeline CSV — try again.'),
    ).toBeInTheDocument();
    expect(exportButton).not.toBeDisabled();
  });

  it('surfaces persona timeline Markdown failures and releases the download lock', async () => {
    vi.mocked(hoistedMocks.exportAnalyticsPersonaStatsTimelineMarkdown).mockRejectedValueOnce(
      new Error('boom'),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    }));
    await screen.findByRole('region', { name: 'The Analyst daily activity timeline' });

    const exportButton = screen.getByRole('button', {
      name: 'Download The Analyst daily timeline Markdown',
    });
    fireEvent.click(exportButton);

    expect(
      await screen.findByText('Could not download persona timeline MARKDOWN — try again.'),
    ).toBeInTheDocument();
    expect(exportButton).not.toBeDisabled();
  });

  it('clears the previous persona timeline before showing a different drill-down', async () => {
    vi.mocked(hoistedMocks.getAnalyticsPersonaStatsTimeline)
      .mockImplementationOnce(() => Promise.resolve({
        persona_id: 'analyst',
        name: 'The Analyst',
        days: 3,
        window_start: '2026-08-18',
        window_end: '2026-08-20',
        total_appearances: 3,
        total_wins: 2,
        best_day: '2026-08-19',
        best_day_wins: 1,
        best_day_appearances: 1,
        best_day_win_rate: 1,
        timeline: [
          { date: '2026-08-18', appearances: 1, wins: 0, win_rate: 0 },
          { date: '2026-08-19', appearances: 1, wins: 1, win_rate: 1 },
          { date: '2026-08-20', appearances: 1, wins: 1, win_rate: 1 },
        ],
      }))
      .mockImplementationOnce(() => Promise.resolve({
        persona_id: 'philosopher',
        name: 'The Philosopher',
        days: 3,
        window_start: '2026-08-18',
        window_end: '2026-08-20',
        total_appearances: 1,
        total_wins: 0,
        best_day: null,
        best_day_wins: 0,
        best_day_appearances: 0,
        best_day_win_rate: 0,
        timeline: [
          { date: '2026-08-18', appearances: 0, wins: 0, win_rate: 0 },
          { date: '2026-08-19', appearances: 1, wins: 0, win_rate: 0 },
          { date: '2026-08-20', appearances: 0, wins: 0, win_rate: 0 },
        ],
      }));

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    fireEvent.click(await screen.findByRole('button', {
      name: 'Show The Analyst daily timeline',
    }));
    expect(await screen.findByRole('region', {
      name: 'The Analyst daily activity timeline',
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: 'Show The Philosopher daily timeline',
    }));
    await waitFor(() => {
      expect(screen.queryByRole('region', {
        name: 'The Analyst daily activity timeline',
      })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('region', {
      name: 'The Philosopher daily activity timeline',
    })).toBeInTheDocument();
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

  it('downloads the flattened persona win-rate trend with the selected filters', async () => {
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

    const trendCsvBlob = new Blob(['persona_id,bucket_start,win_rate\nanalyst,2026-08-11,1\n'], {
      type: 'text/csv',
    });
    Object.defineProperty(trendCsvBlob, 'text', {
      value: vi.fn().mockResolvedValue('persona_id,bucket_start,win_rate\nanalyst,2026-08-11,1\n'),
    });
    hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv.mockResolvedValueOnce({
      blob: trendCsvBlob,
      filename: 'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.csv',
    });
    const exportButton = await screen.findByRole('button', { name: '🏆 Win Rates Trend CSV' });
    exportButton.click();

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv).toHaveBeenCalledWith(7, 5, true);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.csv',
      );
    });
    expect(exportButton).not.toBeDisabled();
  });

  it('marks the trend CSV export busy until the download request settles', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    let finishExport: (value: { blob: Blob; filename: string }) => void = () => undefined;
    hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv.mockImplementationOnce(
      () => new Promise((resolve) => {
        finishExport = resolve;
      }),
    );
    const exportButton = await screen.findByRole('button', { name: '🏆 Win Rates Trend CSV' });

    fireEvent.click(exportButton);

    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      finishExport({
        blob: new Blob(['persona_id,bucket_start,win_rate\n']),
        filename: 'arena-persona-win-rate-trend.csv',
      });
    });
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(exportButton).toHaveAttribute('aria-busy', 'false');
  });

  it('downloads the flattened persona win-rate trend as JSON with the selected filters', async () => {
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

    hoistedMocks.exportAnalyticsPersonaWinRateTrendJson.mockResolvedValueOnce({
      blob: new Blob(['{"row_count":1,"rows":[]}'], { type: 'application/json' }),
      filename: 'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.json',
    });
    const exportButton = await screen.findByRole('button', { name: '🏆 Win Rates Trend JSON' });
    expect(exportButton).toHaveStyle({ color: '#4A3728' });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendJson).toHaveBeenCalledWith(7, 5, true);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.json',
      );
    });
    expect(exportButton).not.toBeDisabled();
  });

  it('copies the filtered persona win-rate trend CSV to the clipboard', async () => {
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

    const trendCsvBlob = new Blob(['persona_id,bucket_start,win_rate\nanalyst,2026-08-11,1\n'], {
      type: 'text/csv',
    });
    Object.defineProperty(trendCsvBlob, 'text', {
      value: vi.fn().mockResolvedValue('persona_id,bucket_start,win_rate\nanalyst,2026-08-11,1\n'),
    });
    hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv.mockResolvedValueOnce({
      blob: trendCsvBlob,
      filename: 'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.csv',
    });
    const copyButton = await screen.findByRole('button', { name: 'Copy persona win-rate trend CSV' });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv).toHaveBeenCalledWith(7, 5, true);
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith(
        'persona_id,bucket_start,win_rate\nanalyst,2026-08-11,1\n',
      );
    });
    expect(copyButton).not.toBeDisabled();
  });

  it('copies the filtered persona win-rate trend as JSON', async () => {
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

    const trendJsonBlob = new Blob(['{"row_count":1,"rows":[]}'], {
      type: 'application/json',
    });
    Object.defineProperty(trendJsonBlob, 'text', {
      value: vi.fn().mockResolvedValue('{"row_count":1,"rows":[]}'),
    });
    hoistedMocks.exportAnalyticsPersonaWinRateTrendJson.mockResolvedValueOnce({
      blob: trendJsonBlob,
      filename: 'arena-persona-win-rate-trend.json',
    });
    const copyButton = await screen.findByRole('button', {
      name: 'Copy persona win-rate trend JSON',
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendJson).toHaveBeenCalledWith(7, 5, true);
      expect(hoistedMocks.copyJsonToClipboard).toHaveBeenCalledWith('{"row_count":1,"rows":[]}');
      expect(screen.getByText('Copied persona win-rate trend JSON to the clipboard.')).toBeInTheDocument();
    });
    expect(copyButton).not.toBeDisabled();
  });

  it('keeps persona win-rate trend JSON filters locked until copying finishes', async () => {
    let finishExport: (value: { blob: Blob; filename: string }) => void = () => undefined;
    hoistedMocks.exportAnalyticsPersonaWinRateTrendJson.mockImplementationOnce(
      () => new Promise((resolve) => {
        finishExport = resolve;
      }),
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /persona win-rate window/i,
    });
    const minimumSelect = await screen.findByRole('combobox', {
      name: /persona win-rate minimum appearances/i,
    });
    const fallbackCheckbox = await screen.findByRole('checkbox', {
      name: /include fallback scorings/i,
    });
    const copyButton = await screen.findByRole('button', {
      name: 'Copy persona win-rate trend JSON',
    });

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendJson).toHaveBeenCalledWith(30, 1, false);
    });
    expect(windowSelect).toBeDisabled();
    expect(minimumSelect).toBeDisabled();
    expect(fallbackCheckbox).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');
    expect(copyButton).toHaveAttribute('title', 'Copy the filtered persona win-rate trend as JSON');

    const trendJsonBlob = new Blob(['{"rows":[]}'], { type: 'application/json' });
    Object.defineProperty(trendJsonBlob, 'text', {
      value: vi.fn().mockResolvedValue('{"rows":[]}'),
    });
    await act(async () => {
      finishExport({ blob: trendJsonBlob, filename: 'arena-persona-win-rate-trend.json' });
    });

    await waitFor(() => {
      expect(hoistedMocks.copyJsonToClipboard).toHaveBeenCalledWith('{"rows":[]}');
      expect(windowSelect).not.toBeDisabled();
      expect(minimumSelect).not.toBeDisabled();
      expect(fallbackCheckbox).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('surfaces persona win-rate trend JSON clipboard failures and releases the lock', async () => {
    hoistedMocks.copyJsonToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const copyButton = await screen.findByRole('button', {
      name: 'Copy persona win-rate trend JSON',
    });
    fireEvent.click(copyButton);

    expect(
      await screen.findByText('Could not copy persona win-rate trend JSON — try again.'),
    ).toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it('keeps persona win-rate trend filters locked through the full clipboard copy', async () => {
    let finishExport: (value: { blob: Blob; filename: string }) => void = () => undefined;
    hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv.mockImplementationOnce(
      () => new Promise((resolve) => {
        finishExport = resolve;
      }),
    );

    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const windowSelect = await screen.findByRole('combobox', {
      name: /persona win-rate window/i,
    });
    const minimumSelect = await screen.findByRole('combobox', {
      name: /persona win-rate minimum appearances/i,
    });
    const fallbackCheckbox = await screen.findByRole('checkbox', {
      name: /include fallback scorings/i,
    });
    const copyButton = await screen.findByRole('button', { name: 'Copy persona win-rate trend CSV' });

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendCsv).toHaveBeenCalledWith(30, 1, false);
    });
    expect(windowSelect).toBeDisabled();
    expect(minimumSelect).toBeDisabled();
    expect(fallbackCheckbox).toBeDisabled();
    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('aria-busy', 'true');
    expect(copyButton).toHaveAttribute('title', 'Copy the filtered persona win-rate trend as CSV');

    await act(async () => {
      finishExport({
        blob: hoistedMocks.personaWinRateTrendCsvBlob,
        filename: 'arena-persona-win-rate-trend.csv',
      });
    });

    await waitFor(() => {
      expect(hoistedMocks.copyCsvToClipboard).toHaveBeenCalledWith(
        'persona_id,bucket_start,win_rate',
      );
      expect(windowSelect).not.toBeDisabled();
      expect(minimumSelect).not.toBeDisabled();
      expect(fallbackCheckbox).not.toBeDisabled();
      expect(copyButton).not.toBeDisabled();
      expect(copyButton).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('surfaces persona win-rate trend CSV clipboard failures and releases the lock', async () => {
    hoistedMocks.copyCsvToClipboard.mockResolvedValueOnce(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const copyButton = await screen.findByRole('button', { name: 'Copy persona win-rate trend CSV' });
    fireEvent.click(copyButton);

    expect(
      await screen.findByText('Could not copy persona win-rate trend CSV — try again.'),
    ).toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it('downloads the filtered persona win-rate trend as Markdown', async () => {
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

    hoistedMocks.exportAnalyticsPersonaWinRateTrendMarkdown.mockResolvedValueOnce({
      blob: new Blob(['# Arena — persona win-rate weekly trend'], { type: 'text/markdown' }),
      filename: 'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.md',
    });
    const exportButton = await screen.findByRole('button', {
      name: '🏆 Win Rates Trend Markdown',
    });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendMarkdown).toHaveBeenCalledWith(7, 5, true);
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-persona-win-rate-trend-2026-08-11-to-2026-08-17.md',
      );
    });
    expect(exportButton).not.toBeDisabled();
  });

  it('copies the filtered persona win-rate trend as Markdown', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const markdownBlob = new Blob(['# Arena — persona win-rate weekly trend'], {
      type: 'text/markdown',
    });
    Object.defineProperty(markdownBlob, 'text', {
      value: vi.fn().mockResolvedValue('# Arena — persona win-rate weekly trend'),
    });
    hoistedMocks.exportAnalyticsPersonaWinRateTrendMarkdown.mockResolvedValueOnce({
      blob: markdownBlob,
      filename: 'arena-persona-win-rate-trend.md',
    });
    const copyButton = await screen.findByRole('button', {
      name: 'Copy persona win-rate trend Markdown',
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(hoistedMocks.exportAnalyticsPersonaWinRateTrendMarkdown).toHaveBeenCalledWith(30, 1, false);
      expect(hoistedMocks.copyMarkdownToClipboard).toHaveBeenCalledWith(
        '# Arena — persona win-rate weekly trend',
      );
    });
    expect(copyButton).not.toBeDisabled();
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
