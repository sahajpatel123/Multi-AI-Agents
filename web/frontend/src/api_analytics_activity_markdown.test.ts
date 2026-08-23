import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAnalyticsActivityMarkdown } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function expectBlob(value: unknown): void {
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}

describe('Analytics activity Markdown export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the export endpoint with the requested window', async () => {
    const mockBlob = new Blob(['# Arena — activity timeline'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-activity-2026-08-05-to-2026-08-11.md"',
        },
      }),
    );

    const res = await exportAnalyticsActivityMarkdown(14);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/activity/export.md?days=14',
      {},
    );
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-activity-2026-08-05-to-2026-08-11.md',
    );
  });

  it('falls back to a days-based filename when the header is missing', async () => {
    const mockBlob = new Blob(['# Arena — activity timeline'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 }),
    );

    const res = await exportAnalyticsActivityMarkdown(30);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-activity-30d.md');
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many activity Markdown exports' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-789' },
        },
      ),
    );

    await expect(exportAnalyticsActivityMarkdown()).rejects.toMatchObject({
      status: 429,
      message: 'Too many activity Markdown exports (Request ID: req-789)',
    });
  });
});
