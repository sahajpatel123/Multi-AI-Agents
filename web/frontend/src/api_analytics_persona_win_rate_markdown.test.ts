import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAnalyticsPersonaWinRateMarkdown } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function expectBlob(value: unknown): void {
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}

describe('Analytics persona win-rate Markdown export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the export endpoint with the requested window', async () => {
    const mockBlob = new Blob(['# Arena — persona win rates'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-persona-win-rate-2026-07-13-to-2026-08-11.md"',
        },
      }),
    );

    const res = await exportAnalyticsPersonaWinRateMarkdown(14, 10);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export.md?window_days=14&min_appearances=10',
      {},
    );
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-persona-win-rate-2026-07-13-to-2026-08-11.md',
    );
  });

  it('includes fallback scorings only when explicitly requested', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['# Arena — persona win rates']), { status: 200 }),
    );

    await exportAnalyticsPersonaWinRateMarkdown(30, 1, true);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate/export.md?window_days=30&min_appearances=1&include_fallback=true',
      {},
    );
  });

  it('falls back to a window-based filename when the header is missing', async () => {
    const mockBlob = new Blob(['# Arena — persona win rates'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 }),
    );

    const res = await exportAnalyticsPersonaWinRateMarkdown(30);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-persona-win-rates-30d.md');
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many persona win-rate export requests' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-456' },
        },
      ),
    );

    await expect(exportAnalyticsPersonaWinRateMarkdown()).rejects.toMatchObject({
      status: 429,
      message: 'Too many persona win-rate export requests (Request ID: req-456)',
    });
  });
});
