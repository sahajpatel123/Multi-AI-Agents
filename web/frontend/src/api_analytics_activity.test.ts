import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, getAnalyticsActivity } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Analytics activity timeline frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the live activity endpoint with the requested window', async () => {
    const payload = {
      window_days: 30,
      start_date: '2026-07-13',
      end_date: '2026-08-11',
      activity: [{ date: '2026-08-11', prompts: 1, debates: 0, discusses: 0, agent_runs: 0 }],
      totals: { prompts: 1, debates: 0, discusses: 0, agent_runs: 0 },
      active_days: 1,
      current_streak: 1,
      longest_streak: 1,
      busiest_day: '2026-08-11',
      busiest_day_count: 1,
    };
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    const res = await getAnalyticsActivity(14);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/activity?days=14',
      {},
    );
    expect(res.current_streak).toBe(1);
    expect(res.totals.prompts).toBe(1);
  });

  it('uses the default 30-day window when no days are provided', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          window_days: 30,
          start_date: '2026-07-13',
          end_date: '2026-08-11',
          activity: [],
          totals: { prompts: 0, debates: 0, discusses: 0, agent_runs: 0 },
          active_days: 0,
          current_streak: 0,
          longest_streak: 0,
          busiest_day: null,
          busiest_day_count: 0,
        }),
        { status: 200 },
      ),
    );

    await getAnalyticsActivity();
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/activity?days=30',
      {},
    );
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many analytics activity requests' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-789' },
        },
      ),
    );

    await expect(getAnalyticsActivity()).rejects.toMatchObject({
      status: 429,
      message: 'Too many analytics activity requests (Request ID: req-789)',
    });
  });

  it('rejects malformed activity payloads instead of returning unusable data', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          window_days: 30,
          start_date: '2026-07-13',
          end_date: '2026-08-11',
          activity: [],
          totals: { prompts: 1 },
          active_days: 1,
          current_streak: 1,
          longest_streak: 1,
          busiest_day: null,
          busiest_day_count: 0,
        }),
        { status: 200, headers: { 'x-request-id': 'req-malformed' } },
      ),
    );

    await expect(getAnalyticsActivity()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed activity timeline response (Request ID: req-malformed)',
    });
  });

  it('rejects activity payloads whose timeline is not an array', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          window_days: 30,
          start_date: '2026-07-13',
          end_date: '2026-08-11',
          activity: null,
          totals: { prompts: 1, debates: 0, discusses: 0, agent_runs: 0 },
          active_days: 1,
          current_streak: 1,
          longest_streak: 1,
          busiest_day: null,
          busiest_day_count: 0,
        }),
        { status: 200 },
      ),
    );

    await expect(getAnalyticsActivity()).rejects.toBeInstanceOf(ApiError);
  });
});
