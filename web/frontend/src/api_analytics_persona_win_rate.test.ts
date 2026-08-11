import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, getAnalyticsPersonaWinRate } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function winRatePayload(overrides: Record<string, unknown> = {}) {
  return {
    window_days: 30,
    window_start: '2026-07-13',
    window_end: '2026-08-11',
    min_appearances: 1,
    include_fallback: false,
    low_confidence_threshold: 5,
    scored_exchanges: 10,
    unattributed_exchanges: 0,
    fallback_exchanges: 0,
    personas: [
      {
        persona_id: 'analyst',
        name: 'The Analyst',
        color: '#F0B84E',
        appearances: 8,
        wins: 6,
        win_rate: 0.75,
        low_confidence: false,
      },
    ],
    best_persona_id: 'analyst',
    best_win_rate: 0.75,
    ...overrides,
  };
}

describe('Analytics persona win-rate frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the persona win-rate endpoint with the requested window and floor', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(winRatePayload()), { status: 200 }),
    );

    const res = await getAnalyticsPersonaWinRate(14, 2);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate?window_days=14&min_appearances=2',
      {},
    );
    expect(res.window_days).toBe(30);
    expect(res.personas[0].name).toBe('The Analyst');
    expect(res.best_persona_id).toBe('analyst');
  });

  it('uses the default 30-day window and one-appearance floor', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(winRatePayload()), { status: 200 }),
    );

    await getAnalyticsPersonaWinRate();
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/persona-win-rate?window_days=30&min_appearances=1',
      {},
    );
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many persona win-rate requests' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-456' },
        },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 429,
      message: 'Too many persona win-rate requests (Request ID: req-456)',
    });
  });

  it('rejects malformed persona win-rate payloads', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(winRatePayload({ personas: null })),
        { status: 200, headers: { 'x-request-id': 'req-malformed' } },
      ),
    );

    const request = getAnalyticsPersonaWinRate();
    await expect(request).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-malformed)',
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });
});
