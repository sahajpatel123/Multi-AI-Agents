import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportAnalyticsSummaryCsv,
  exportAnalyticsSummaryJson,
  exportAnalyticsSummaryMarkdown,
  exportAnalyticsPersonaWinRateCsv,
  exportAnalyticsPersonaWinRateJson,
  exportAnalyticsCategoryStatsCsv,
  exportAnalyticsCategoryStatsJson,
  exportAnalyticsCategoryStatsMarkdown,
  exportAnalyticsActivityCsv,
  exportAnalyticsPersonaStatsOverviewCsv,
  exportAnalyticsPersonaStatsOverviewJson,
  exportAnalyticsPersonaStatsOverviewMarkdown,
  exportAnalyticsPersonaStatsTimelineCsv,
  exportAnalyticsPersonaStatsByCategoryCsv,
  exportAgentWatchlistHistoryCsv,
  exportAgentWatchlistHistoryJson,
} from './api';
import * as apiFetchModule from './lib/apiFetch';
import { expectBlob } from './test/blob';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Analytics CSV export frontend API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportAnalyticsSummaryCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['metric,value\ntest,123'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsSummaryCsv(30);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/summary/export.csv?window_days=30',
      {}
    );
  });

  it('rejects an invalid summary CSV window before fetching', async () => {
    await expect(exportAnalyticsSummaryCsv(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    await expect(exportAnalyticsSummaryCsv(366)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces request IDs on summary CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many summary CSV exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-summary-csv' },
      }),
    );

    await expect(exportAnalyticsSummaryCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many summary CSV exports (Request ID: req-summary-csv)',
    });
  });

  it('exportAnalyticsSummaryJson returns the server filename', async () => {
    const mockBlob = new Blob(['{"window_days":30,"total_prompts":0}'], {
      type: 'application/json',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-summary-2026-07-13-to-2026-08-11.json"',
        },
      }),
    );

    const res = await exportAnalyticsSummaryJson(30);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-summary-2026-07-13-to-2026-08-11.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/summary/export.json?window_days=30',
      {},
    );
  });

  it('rejects an invalid summary window before fetching', async () => {
    await expect(exportAnalyticsSummaryJson(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsSummaryMarkdown returns the server filename', async () => {
    const mockBlob = new Blob(['# Arena — analytics summary'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-summary-2026-07-13-to-2026-08-11.md"',
        },
      }),
    );

    const res = await exportAnalyticsSummaryMarkdown(30);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-summary-2026-07-13-to-2026-08-11.md');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/summary/export.md?window_days=30',
      {},
    );
  });

  it('rejects an invalid summary Markdown window before fetching', async () => {
    await expect(exportAnalyticsSummaryMarkdown(366)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsPersonaWinRateCsv returns the server filename', async () => {
    const mockBlob = new Blob(['persona_id,win_rate'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-win-rate-2026-08-01-to-2026-08-14.csv"',
        },
      })
    );

    const res = await exportAnalyticsPersonaWinRateCsv(14, 5);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rate-2026-08-01-to-2026-08-14.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export.csv?window_days=14&min_appearances=5',
      {}
    );
  });

  it('surfaces request IDs on persona win-rate CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many persona win-rate exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-persona-win-rate-csv' },
      }),
    );

    await expect(exportAnalyticsPersonaWinRateCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many persona win-rate exports (Request ID: req-persona-win-rate-csv)',
    });
  });

  it('falls back to a window-based filename when the CSV response omits one', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['persona_id,win_rate'], { type: 'text/csv' }), { status: 200 }),
    );

    const res = await exportAnalyticsPersonaWinRateCsv(7);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rates-7d.csv');
  });

  it('exportAnalyticsPersonaWinRateJson returns the server filename', async () => {
    const mockBlob = new Blob(['{"window_days":14,"personas":[]}'], {
      type: 'application/json',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-win-rate-2026-08-01-to-2026-08-14.json"',
        },
      }),
    );

    const res = await exportAnalyticsPersonaWinRateJson(14, 3);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rate-2026-08-01-to-2026-08-14.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export.json?window_days=14&min_appearances=3',
      {},
    );
  });

  it('falls back to a window-based filename when the JSON response omits one', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{}'], { type: 'application/json' }), { status: 200 }),
    );

    const res = await exportAnalyticsPersonaWinRateJson(7);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rates-7d.json');
  });

  it('rejects an invalid persona win-rate sample floor before fetching', async () => {
    await expect(exportAnalyticsPersonaWinRateCsv(30, 0)).rejects.toThrow(
      'minAppearances must be an integer between 1 and 200',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsCategoryStatsCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['category,total'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsCategoryStatsCsv(7);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/category-stats/export.csv?window_days=7',
      {}
    );
  });

  it('exportAnalyticsCategoryStatsJson returns the server filename', async () => {
    const mockBlob = new Blob(['{"categories":[]}'], { type: 'application/json' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-category-stats-2026-08-01-to-2026-08-07.json"',
        },
      }),
    );

    const res = await exportAnalyticsCategoryStatsJson(7);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-category-stats-2026-08-01-to-2026-08-07.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/category-stats/export.json?window_days=7',
      {},
    );
  });

  it('rejects an invalid category-stats JSON window before fetching', async () => {
    await expect(exportAnalyticsCategoryStatsJson(366)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsCategoryStatsMarkdown returns the server filename', async () => {
    const mockBlob = new Blob(['# Arena — category stats'], { type: 'text/markdown' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-category-stats-2026-08-01-to-2026-08-07.md"',
        },
      }),
    );

    const res = await exportAnalyticsCategoryStatsMarkdown(7);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-category-stats-2026-08-01-to-2026-08-07.md');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/category-stats/export.md?window_days=7',
      {},
    );
  });

  it('rejects an invalid category-stats Markdown window before fetching', async () => {
    await expect(exportAnalyticsCategoryStatsMarkdown(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsActivityCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['date,prompts'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsActivityCsv(14);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/activity/export.csv?days=14',
      {}
    );
  });

  it('surfaces request IDs on activity CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many activity CSV exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-activity-csv' },
      }),
    );

    await expect(exportAnalyticsActivityCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many activity CSV exports (Request ID: req-activity-csv)',
    });
  });

  it('surfaces request IDs on category stats CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many category CSV exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-category-stats-csv' },
      }),
    );

    await expect(exportAnalyticsCategoryStatsCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many category CSV exports (Request ID: req-category-stats-csv)',
    });
  });

  it('surfaces request IDs on persona timeline CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many timeline exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-persona-timeline-csv' },
      }),
    );

    await expect(exportAnalyticsPersonaStatsTimelineCsv('analyst')).rejects.toMatchObject({
      status: 429,
      message: 'Too many timeline exports (Request ID: req-persona-timeline-csv)',
    });
  });

  it('surfaces request IDs on by-category CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many category breakdown exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-by-category-csv' },
      }),
    );

    await expect(exportAnalyticsPersonaStatsByCategoryCsv('analyst')).rejects.toMatchObject({
      status: 429,
      message: 'Too many category breakdown exports (Request ID: req-by-category-csv)',
    });
  });

  it('exportAnalyticsPersonaStatsOverviewCsv returns the server filename', async () => {
    const mockBlob = new Blob(['persona_id,name'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-stats-overview-2026-08-01-to-2026-08-30.csv"',
        },
      })
    );

    const res = await exportAnalyticsPersonaStatsOverviewCsv(30);
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-persona-stats-overview-2026-08-01-to-2026-08-30.csv',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/export.csv?window_days=30',
      {}
    );
  });

  it('falls back to a window-based filename when the overview CSV response omits one', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['persona_id,name'], { type: 'text/csv' }), { status: 200 }),
    );

    const res = await exportAnalyticsPersonaStatsOverviewCsv(7);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-stats-overview-7d.csv');
  });

  it('rejects an invalid persona stats overview CSV window before fetching', async () => {
    await expect(exportAnalyticsPersonaStatsOverviewCsv(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    await expect(exportAnalyticsPersonaStatsOverviewCsv(366)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces request IDs on persona stats overview CSV failures', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Too many persona-stats CSV exports' }), {
        status: 429,
        headers: { 'x-request-id': 'req-persona-stats-csv' },
      }),
    );

    await expect(exportAnalyticsPersonaStatsOverviewCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many persona-stats CSV exports (Request ID: req-persona-stats-csv)',
    });
  });

  it('exportAnalyticsPersonaStatsOverviewJson returns the server filename', async () => {
    const mockBlob = new Blob(['{"personas":[]}'], { type: 'application/json' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-stats-overview-2026-08-01-to-2026-08-30.json"',
        },
      }),
    );

    const res = await exportAnalyticsPersonaStatsOverviewJson(30);
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-persona-stats-overview-2026-08-01-to-2026-08-30.json',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/export.json?window_days=30',
      {},
    );
  });

  it('rejects an invalid persona stats overview JSON window before fetching', async () => {
    await expect(exportAnalyticsPersonaStatsOverviewJson(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    await expect(exportAnalyticsPersonaStatsOverviewJson(366)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsPersonaStatsOverviewMarkdown returns the server filename', async () => {
    const mockBlob = new Blob(['# Arena — persona stats overview'], { type: 'text/markdown' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-stats-overview-2026-08-01-to-2026-08-30.md"',
        },
      }),
    );

    const res = await exportAnalyticsPersonaStatsOverviewMarkdown(30);
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-persona-stats-overview-2026-08-01-to-2026-08-30.md',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/export.md?window_days=30',
      {},
    );
  });

  it('rejects an invalid persona stats overview Markdown window before fetching', async () => {
    await expect(exportAnalyticsPersonaStatsOverviewMarkdown(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    await expect(exportAnalyticsPersonaStatsOverviewMarkdown(366)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsPersonaStatsTimelineCsv encodes persona ID safely', async () => {
    const mockBlob = new Blob(['date,wins'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-timeline-claude-opus-2026-08-14-to-2026-08-20.csv"',
        },
      })
    );

    const res = await exportAnalyticsPersonaStatsTimelineCsv('claude/opus', 30);
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-timeline-claude-opus-2026-08-14-to-2026-08-20.csv',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/claude%2Fopus/timeline/export.csv?days=30',
      {}
    );
  });

  it('uses a safe window-based filename when the timeline response omits one', async () => {
    const mockBlob = new Blob(['date,wins'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 }),
    );

    const res = await exportAnalyticsPersonaStatsTimelineCsv(' claude/opus ', 7);

    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-timeline-claude-opus-7d.csv');
  });

  it('rejects invalid persona timeline export inputs before fetching', async () => {
    await expect(exportAnalyticsPersonaStatsTimelineCsv('   ')).rejects.toThrow(
      'personaId must not be empty',
    );
    await expect(exportAnalyticsPersonaStatsTimelineCsv('analyst', 91)).rejects.toThrow(
      'windowDays must be an integer between 1 and 90',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('exportAnalyticsPersonaStatsByCategoryCsv encodes persona ID safely', async () => {
    const mockBlob = new Blob(['category,wins'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsPersonaStatsByCategoryCsv('gpt-4o', 30);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/gpt-4o/by-category/export.csv?window_days=30',
      {}
    );
  });

  it('exportAgentWatchlistHistoryCsv encodes item ID and clamps limit', async () => {
    const mockBlob = new Blob(['task_id,question,status'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAgentWatchlistHistoryCsv('item-123/abc', 100);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/watchlist/item-123%2Fabc/history/export.csv?limit=100',
      {}
    );
  });

  it('exportAgentWatchlistHistoryJson encodes item ID and clamps limit', async () => {
    const mockBlob = new Blob(['{"success":true}'], { type: 'application/json' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAgentWatchlistHistoryJson('item-123/abc', 100);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/watchlist/item-123%2Fabc/history/export.json?limit=100',
      {}
    );
  });
});
