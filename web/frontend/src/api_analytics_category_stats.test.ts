import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError, getAnalyticsCategoryStats } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function categoryPayload(overrides: Record<string, unknown> = {}) {
  return {
    window_days: 30,
    window_start: '2026-07-13',
    window_end: '2026-08-11',
    total_appearances: 3,
    total_wins: 2,
    most_active_category: 'question',
    categories: [
      {
        category: 'question',
        is_known_category: true,
        is_uncategorized: false,
        appearances: 2,
        wins: 2,
        win_rate: 1,
        avg_winning_score: 86.5,
        last_exchange_at: '2026-08-11T10:00:00',
        best_persona_id: 'analyst',
      },
      {
        category: 'task',
        is_known_category: true,
        is_uncategorized: false,
        appearances: 1,
        wins: 0,
        win_rate: 0,
        avg_winning_score: null,
        last_exchange_at: null,
        best_persona_id: null,
      },
    ],
    ...overrides,
  };
}

describe('Analytics category stats frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and validates category performance for the requested window', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(categoryPayload()), { status: 200 }),
    );

    const result = await getAnalyticsCategoryStats(14);

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/category-stats?window_days=14',
      {},
    );
    expect(result.categories[0].best_persona_id).toBe('analyst');
    expect(result.total_wins).toBe(2);
  });

  it('uses the default 30-day window', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(categoryPayload()), { status: 200 }),
    );

    await getAnalyticsCategoryStats();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/category-stats?window_days=30',
      {},
    );
  });

  it('rejects malformed rollups instead of returning inconsistent totals', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(categoryPayload({ total_appearances: 99 })),
        { status: 200, headers: { 'x-request-id': 'req-category-malformed' } },
      ),
    );

    await expect(getAnalyticsCategoryStats()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed category stats response (Request ID: req-category-malformed)',
    });
  });

  it('surfaces request IDs on failed category requests', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many category-stats requests' } }),
        { status: 429, headers: { 'x-request-id': 'req-category-limit' } },
      ),
    );

    await expect(getAnalyticsCategoryStats()).rejects.toMatchObject({
      status: 429,
      message: 'Too many category-stats requests (Request ID: req-category-limit)',
    });
  });

  it('rejects invalid window sizes before making a request', async () => {
    await expect(getAnalyticsCategoryStats(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('returns an ApiError for malformed payloads', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(categoryPayload({ categories: null })), { status: 200 }),
    );

    await expect(getAnalyticsCategoryStats()).rejects.toBeInstanceOf(ApiError);
  });
});
