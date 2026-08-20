import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAnalyticsPersonaStatsTimelineMarkdown } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function expectBlob(value: unknown): void {
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}

describe('Persona activity timeline Markdown export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a URL-encoded persona timeline and honors the filename header', async () => {
    const mockBlob = new Blob(['# Arena — The Strategist persona timeline'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-timeline-claude-opus-2026-08-14-to-2026-08-20.md"',
        },
      }),
    );

    const result = await exportAnalyticsPersonaStatsTimelineMarkdown(' claude/opus ', 30);

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/claude%2Fopus/timeline/export.md?days=30',
      {},
    );
    expectBlob(result.blob);
    expect(result.filename).toBe(
      'arena-timeline-claude-opus-2026-08-14-to-2026-08-20.md',
    );
  });

  it('uses a safe fallback filename when the response omits one', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['# timeline'], { type: 'text/markdown' }), { status: 200 }),
    );

    const result = await exportAnalyticsPersonaStatsTimelineMarkdown(' claude/opus ', 7);

    expectBlob(result.blob);
    expect(result.filename).toBe('arena-persona-timeline-claude-opus-7d.md');
  });

  it('rejects invalid inputs before fetching and surfaces API errors', async () => {
    await expect(exportAnalyticsPersonaStatsTimelineMarkdown('   ')).rejects.toThrow(
      'personaId must not be empty',
    );
    await expect(exportAnalyticsPersonaStatsTimelineMarkdown('analyst', 91)).rejects.toThrow(
      'windowDays must be an integer between 1 and 90',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Timeline Markdown unavailable' }), {
        status: 503,
        headers: { 'x-request-id': 'req-persona-timeline-markdown' },
      }),
    );
    await expect(exportAnalyticsPersonaStatsTimelineMarkdown('analyst', 7)).rejects.toMatchObject({
      status: 503,
      message: 'Timeline Markdown unavailable (Request ID: req-persona-timeline-markdown)',
    });
    expect(apiFetchModule.apiFetch).toHaveBeenCalledTimes(1);
  });
});
