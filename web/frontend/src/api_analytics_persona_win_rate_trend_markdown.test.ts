import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAnalyticsPersonaWinRateTrendMarkdown } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Analytics persona win-rate trend Markdown export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the trend export with the requested filters and server filename', async () => {
    const mockBlob = new Blob(['# Arena — persona win-rate weekly trend'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.md"',
        },
      }),
    );

    const res = await exportAnalyticsPersonaWinRateTrendMarkdown(30, 5, true);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export-trend.md?window_days=30&min_appearances=5&include_fallback=true',
      {},
    );
    expect(Object.prototype.toString.call(res.blob)).toBe('[object Blob]');
    expect(res.filename).toBe(
      'arena-persona-win-rate-trend-2026-07-13-to-2026-08-11.md',
    );
  });

  it('uses a window-based filename when the server omits Content-Disposition', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['# trend']), { status: 200 }),
    );

    const res = await exportAnalyticsPersonaWinRateTrendMarkdown(7);
    expect(res.filename).toBe('arena-persona-win-rate-trend-7d.md');
  });

  it('surfaces request IDs on export failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many trend Markdown exports' } }),
        { status: 429, headers: { 'x-request-id': 'req-trend-md-123' } },
      ),
    );

    await expect(exportAnalyticsPersonaWinRateTrendMarkdown()).rejects.toMatchObject({
      status: 429,
      message: 'Too many trend Markdown exports (Request ID: req-trend-md-123)',
    });
  });
});
