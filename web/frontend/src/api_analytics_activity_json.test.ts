import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAnalyticsActivityJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function expectBlob(value: unknown): void {
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}

describe('Analytics activity JSON export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the export endpoint with the requested window', async () => {
    const mockBlob = new Blob(['{"activity":[]}'], { type: 'application/json' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-activity-2026-08-05-to-2026-08-11.json"',
        },
      }),
    );

    const res = await exportAnalyticsActivityJson(14);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/activity/export.json?days=14',
      {},
    );
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-activity-2026-08-05-to-2026-08-11.json',
    );
  });

  it('falls back to a days-based filename when the header is missing', async () => {
    const mockBlob = new Blob(['{"activity":[]}'], { type: 'application/json' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 }),
    );

    const res = await exportAnalyticsActivityJson(30);
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-activity-30d.json');
  });
});
