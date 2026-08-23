import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAnalyticsPersonaWinRateTrendCsv } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Analytics persona win-rate trend CSV export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the flattened trend endpoint with the requested filters', async () => {
    const mockBlob = new Blob(['persona_id,bucket_start,win_rate\n'], {
      type: 'text/csv',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.csv"',
        },
      }),
    );

    const res = await exportAnalyticsPersonaWinRateTrendCsv(30, 5, true);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export-trend.csv?window_days=30&min_appearances=5&include_fallback=true',
      {},
    );
    expect(Object.prototype.toString.call(res.blob)).toBe('[object Blob]');
    expect(res.filename).toBe(
      'arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.csv',
    );
  });

  it('uses a safe fallback filename when the header is missing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['persona_id\n']), { status: 200 }),
    );

    const res = await exportAnalyticsPersonaWinRateTrendCsv(7);
    expect(res.filename).toBe('arena-persona-win-rate-trend-7d.csv');
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many trend exports' } }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-trend-123' },
        },
      ),
    );

    await expect(exportAnalyticsPersonaWinRateTrendCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many trend exports (Request ID: req-trend-123)',
    });
  });
});
