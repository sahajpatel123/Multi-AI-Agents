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
    personas: [winRateRow()],
    best_persona_id: 'analyst',
    best_win_rate: 0.75,
    ...overrides,
  };
}

function winRateRow(overrides: Record<string, unknown> = {}) {
  return {
    persona_id: 'analyst',
    name: 'The Analyst',
    color: '#F0B84E',
    appearances: 8,
    wins: 6,
    win_rate: 0.75,
    low_confidence: false,
    trend_omitted_appearances: 0,
    trend_omitted_wins: 0,
    trend: [
      { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 2, wins: 1, win_rate: 0.5 },
      { bucket_start: '2026-07-20', bucket_end: '2026-07-26', appearances: 1, wins: 1, win_rate: 1 },
      { bucket_start: '2026-07-27', bucket_end: '2026-08-02', appearances: 2, wins: 2, win_rate: 1 },
      { bucket_start: '2026-08-03', bucket_end: '2026-08-09', appearances: 2, wins: 1, win_rate: 0.5 },
      { bucket_start: '2026-08-10', bucket_end: '2026-08-11', appearances: 1, wins: 1, win_rate: 1 },
    ],
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

  it('rejects impossible per-persona win rates', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(winRatePayload({ personas: [winRateRow({ win_rate: 1.5 })] })),
        { status: 200, headers: { 'x-request-id': 'req-rate' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-rate)',
    });
  });

  it('rejects rows where wins outnumber appearances', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [winRateRow({ appearances: 3, wins: 4, win_rate: 0.75 })],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-wins' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-wins)',
    });
  });

  it('rejects duplicate persona rows', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [winRateRow(), winRateRow()],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-dupe' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-dupe)',
    });
  });

  it('rejects trend buckets that do not sum to the row totals', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [
              winRateRow({
                trend: [
                  { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 7, wins: 6, win_rate: 0.857 },
                  { bucket_start: '2026-07-20', bucket_end: '2026-07-26', appearances: 0, wins: 0, win_rate: null },
                ],
              }),
            ],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-sum' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-trend-sum)',
    });
  });

  it('rejects a win_rate on an empty trend bucket', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [
              winRateRow({
                trend: [
                  { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 0, wins: 0, win_rate: 0.5 },
                ],
              }),
            ],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-empty' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-trend-empty)',
    });
  });

  it('rejects trend buckets that are not strictly ascending', async () => {
    const outOfOrder = [
      { bucket_start: '2026-07-20', bucket_end: '2026-07-26', appearances: 1, wins: 1, win_rate: 1 },
      { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 7, wins: 5, win_rate: 0.714 },
    ];
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({ personas: [winRateRow({ trend: outOfOrder })] }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-order' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-trend-order)',
    });
  });

  it('rejects a trend with more than 26 buckets', async () => {
    const tooLong = Array.from({ length: 27 }, (_, i) => {
      const start = new Date(Date.UTC(2026, 0, 1 + 7 * i));
      const end = new Date(Date.UTC(2026, 0, 7 + 7 * i));
      return {
        bucket_start: start.toISOString().slice(0, 10),
        bucket_end: end.toISOString().slice(0, 10),
        appearances: i === 0 ? 8 : 0,
        wins: i === 0 ? 6 : 0,
        win_rate: i === 0 ? 0.75 : null,
      };
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({ personas: [winRateRow({ trend: tooLong })] }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-cap' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-trend-cap)',
    });
  });

  it('accepts null win rates for empty buckets within a valid trend', async () => {
    const withGap = [
      { bucket_start: '2026-07-13', bucket_end: '2026-07-19', appearances: 5, wins: 4, win_rate: 0.8 },
      { bucket_start: '2026-07-20', bucket_end: '2026-07-26', appearances: 0, wins: 0, win_rate: null },
      { bucket_start: '2026-07-27', bucket_end: '2026-08-02', appearances: 3, wins: 2, win_rate: 0.667 },
    ];
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [winRateRow({ appearances: 8, wins: 6, win_rate: 0.75, trend: withGap })],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-gap' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).resolves.toMatchObject({
      personas: [{ persona_id: 'analyst' }],
    });
  });

  it('accepts older appearances omitted from the trend when totals reconcile', async () => {
    const trend = [
      { bucket_start: '2026-02-09', bucket_end: '2026-02-15', appearances: 1, wins: 1, win_rate: 1 },
    ];
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            best_win_rate: 0.667,
            personas: [
              winRateRow({
                appearances: 3,
                wins: 2,
                win_rate: 0.667,
                trend,
                trend_omitted_appearances: 2,
                trend_omitted_wins: 1,
              }),
            ],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-omitted' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).resolves.toMatchObject({
      personas: [{ persona_id: 'analyst' }],
    });
  });

  it('rejects omitted wins that exceed omitted appearances', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [
              winRateRow({
                trend_omitted_appearances: 1,
                trend_omitted_wins: 2,
              }),
            ],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-omit-win' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-trend-omit-win)',
    });
  });

  it('rejects an empty trend array even when totals are zero', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          winRatePayload({
            personas: [
              winRateRow({
                trend: [],
                trend_omitted_appearances: 8,
                trend_omitted_wins: 6,
              }),
            ],
          }),
        ),
        { status: 200, headers: { 'x-request-id': 'req-trend-empty-array' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-trend-empty-array)',
    });
  });

  it('rejects best summaries that do not match a persona row', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(winRatePayload({ best_persona_id: 'ghost' })),
        { status: 200, headers: { 'x-request-id': 'req-best' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-best)',
    });
  });

  it('rejects a best rate without a best persona and vice versa', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(winRatePayload({ best_persona_id: null, best_win_rate: 0.75 })),
        { status: 200, headers: { 'x-request-id': 'req-pair' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-pair)',
    });

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(winRatePayload({ best_persona_id: 'analyst', best_win_rate: null })),
        { status: 200, headers: { 'x-request-id': 'req-pair-2' } },
      ),
    );

    await expect(getAnalyticsPersonaWinRate()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed persona win rate response (Request ID: req-pair-2)',
    });
  });

  it('rejects out-of-range window arguments before fetching', async () => {
    await expect(getAnalyticsPersonaWinRate(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    await expect(getAnalyticsPersonaWinRate(30, 201)).rejects.toThrow(
      'minAppearances must be an integer between 1 and 200',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });
});
