import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportAnalyticsSummaryCsv,
  exportAnalyticsPersonaWinRateCsv,
  exportAnalyticsCategoryStatsCsv,
  exportAnalyticsActivityCsv,
  exportAnalyticsPersonaStatsOverviewCsv,
  exportAnalyticsPersonaStatsTimelineCsv,
  exportAnalyticsPersonaStatsByCategoryCsv,
  exportAgentWatchlistHistoryCsv,
  exportAgentWatchlistHistoryJson,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function expectBlob(value: unknown): void {
  // `Response.blob()` can return a Blob from a different JavaScript realm
  // (Node's undici vs jsdom/global Blob), so `toBeInstanceOf(Blob)` can fail
  // spuriously in CI. This cross-realm-safe check only accepts real Blobs.
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}

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

    const res = await exportAnalyticsPersonaWinRateCsv(14);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rate-2026-08-01-to-2026-08-14.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export.csv?window_days=14',
      {}
    );
  });

  it('falls back to a window-based filename when the CSV response omits one', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['persona_id,win_rate'], { type: 'text/csv' }), { status: 200 }),
    );

    const res = await exportAnalyticsPersonaWinRateCsv(7);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rates-7d.csv');
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

  it('exportAnalyticsPersonaStatsOverviewCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['persona_id,name'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsPersonaStatsOverviewCsv(30);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/export.csv?window_days=30',
      {}
    );
  });

  it('exportAnalyticsPersonaStatsTimelineCsv encodes persona ID safely', async () => {
    const mockBlob = new Blob(['date,wins'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsPersonaStatsTimelineCsv('claude/opus', 30);
    expectBlob(res);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/claude%2Fopus/timeline/export.csv?window_days=30',
      {}
    );
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
