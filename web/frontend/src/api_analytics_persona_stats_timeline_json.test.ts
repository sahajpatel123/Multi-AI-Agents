import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAnalyticsPersonaStatsTimelineJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function expectBlob(value: unknown): void {
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}

describe('Persona activity timeline JSON export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a URL-encoded persona timeline and honors the filename header', async () => {
    const mockBlob = new Blob(['{"timeline":[]}'], { type: 'application/json' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-timeline-claude-opus-2026-08-14-to-2026-08-20.json"',
        },
      }),
    );

    const result = await exportAnalyticsPersonaStatsTimelineJson(' claude/opus ', 30);

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/claude%2Fopus/timeline/export.json?days=30',
      {},
    );
    expectBlob(result.blob);
    expect(result.filename).toBe(
      'arena-timeline-claude-opus-2026-08-14-to-2026-08-20.json',
    );
  });

  it('uses a safe fallback filename when the response omits one', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{}'], { type: 'application/json' }), { status: 200 }),
    );

    const result = await exportAnalyticsPersonaStatsTimelineJson(' claude/opus ', 7);

    expectBlob(result.blob);
    expect(result.filename).toBe('arena-persona-timeline-claude-opus-7d.json');
  });

  it('rejects invalid inputs before fetching and surfaces API errors', async () => {
    await expect(exportAnalyticsPersonaStatsTimelineJson('   ')).rejects.toThrow(
      'personaId must not be empty',
    );
    await expect(exportAnalyticsPersonaStatsTimelineJson('analyst', 91)).rejects.toThrow(
      'windowDays must be an integer between 1 and 90',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Timeline JSON unavailable' }), {
        status: 503,
        headers: { 'x-request-id': 'req-persona-timeline-json' },
      }),
    );
    await expect(exportAnalyticsPersonaStatsTimelineJson('analyst', 7)).rejects.toMatchObject({
      status: 503,
      message: 'Timeline JSON unavailable (Request ID: req-persona-timeline-json)',
    });
    expect(apiFetchModule.apiFetch).toHaveBeenCalledTimes(1);
  });
});
