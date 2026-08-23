import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalyticsPersonaStatsTimeline } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

const timelinePayload = {
  persona_id: 'claude/opus',
  name: 'The Strategist',
  days: 3,
  window_start: '2026-08-18',
  window_end: '2026-08-20',
  total_appearances: 3,
  total_wins: 2,
  best_day: '2026-08-19',
  best_day_wins: 1,
  best_day_appearances: 1,
  best_day_win_rate: 1,
  timeline: [
    { date: '2026-08-18', appearances: 1, wins: 0, win_rate: 0 },
    { date: '2026-08-19', appearances: 1, wins: 1, win_rate: 1 },
    { date: '2026-08-20', appearances: 1, wins: 1, win_rate: 1 },
  ],
};

describe('getAnalyticsPersonaStatsTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a URL-encoded persona timeline and validates the response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(timelinePayload), { status: 200 }),
    );

    const response = await getAnalyticsPersonaStatsTimeline(' claude/opus ', 3);

    expect(response).toEqual(timelinePayload);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-stats/claude%2Fopus/timeline?days=3',
      {},
    );
  });

  it('rejects invalid persona IDs and day windows before fetching', async () => {
    await expect(getAnalyticsPersonaStatsTimeline('   ')).rejects.toThrow(
      'personaId must not be empty',
    );
    await expect(getAnalyticsPersonaStatsTimeline('analyst', 0)).rejects.toThrow(
      'days must be an integer between 1 and 90',
    );
    await expect(getAnalyticsPersonaStatsTimeline('analyst', 91)).rejects.toThrow(
      'days must be an integer between 1 and 90',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('rejects a timeline whose rollup does not reconcile with its daily rows', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ...timelinePayload, total_wins: 3 }), { status: 200 }),
    );

    await expect(getAnalyticsPersonaStatsTimeline('analyst', 3)).rejects.toMatchObject({
      message: 'Malformed persona activity timeline response',
      status: 200,
    });
  });

  it('rejects non-contiguous daily buckets', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        ...timelinePayload,
        window_end: '2026-08-21',
        timeline: [
          { date: '2026-08-18', appearances: 1, wins: 0, win_rate: 0 },
          { date: '2026-08-19', appearances: 1, wins: 1, win_rate: 1 },
          { date: '2026-08-21', appearances: 1, wins: 1, win_rate: 1 },
        ],
      }), { status: 200 }),
    );

    await expect(getAnalyticsPersonaStatsTimeline('analyst', 3)).rejects.toMatchObject({
      message: 'Malformed persona activity timeline response',
      status: 200,
    });
  });

  it('rejects a daily rate that does not match its win count', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        ...timelinePayload,
        timeline: timelinePayload.timeline.map((point, index) => (
          index === 1 ? { ...point, win_rate: 0.5 } : point
        )),
      }), { status: 200 }),
    );

    await expect(getAnalyticsPersonaStatsTimeline('analyst', 3)).rejects.toMatchObject({
      message: 'Malformed persona activity timeline response',
      status: 200,
    });
  });

  it('rejects impossible calendar dates instead of accepting date normalization', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        ...timelinePayload,
        window_start: '2026-02-31',
        timeline: [
          { date: '2026-02-31', appearances: 1, wins: 0, win_rate: 0 },
          { date: '2026-03-01', appearances: 1, wins: 1, win_rate: 1 },
          { date: '2026-03-02', appearances: 1, wins: 1, win_rate: 1 },
        ],
      }), { status: 200 }),
    );

    await expect(getAnalyticsPersonaStatsTimeline('analyst', 3)).rejects.toMatchObject({
      message: 'Malformed persona activity timeline response',
      status: 200,
    });
  });

  it('surfaces request IDs when the timeline request fails', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Timeline temporarily unavailable' }), {
        status: 503,
        headers: { 'x-request-id': 'req-persona-timeline' },
      }),
    );

    await expect(getAnalyticsPersonaStatsTimeline('analyst')).rejects.toMatchObject({
      status: 503,
      message: 'Timeline temporarily unavailable (Request ID: req-persona-timeline)',
    });
  });
});
