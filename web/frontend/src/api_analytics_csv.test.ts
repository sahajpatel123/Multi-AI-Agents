import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportAnalyticsSummaryCsv,
  exportAnalyticsPersonaWinRateCsv,
  exportAnalyticsCategoryStatsCsv,
  exportAnalyticsPersonaStatsOverviewCsv,
  exportAnalyticsPersonaStatsTimelineCsv,
  exportAnalyticsPersonaStatsByCategoryCsv,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

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
    expect(res).toBeInstanceOf(Blob);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/summary/export.csv?window_days=30',
      {}
    );
  });

  it('exportAnalyticsPersonaWinRateCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['persona_id,win_rate'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsPersonaWinRateCsv(14);
    expect(res).toBeInstanceOf(Blob);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export.csv?window_days=14',
      {}
    );
  });

  it('exportAnalyticsCategoryStatsCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['category,total'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsCategoryStatsCsv(7);
    expect(res).toBeInstanceOf(Blob);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/category-stats/export.csv?window_days=7',
      {}
    );
  });

  it('exportAnalyticsPersonaStatsOverviewCsv fetches expected endpoint', async () => {
    const mockBlob = new Blob(['persona_id,name'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportAnalyticsPersonaStatsOverviewCsv(30);
    expect(res).toBeInstanceOf(Blob);
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
    expect(res).toBeInstanceOf(Blob);
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
    expect(res).toBeInstanceOf(Blob);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/gpt-4o/by-category/export.csv?window_days=30',
      {}
    );
  });
});
