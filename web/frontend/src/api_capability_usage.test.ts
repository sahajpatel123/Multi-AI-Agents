import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCapabilityUsage } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

const usagePayload = {
  window_days: 30,
  window_start: '2026-07-25',
  window_end: '2026-08-23',
  by_mode: { arena: 5, agent: 12, debate: 0, discuss: 0, other: 0 },
  by_category: { research: 5, coding: 12 },
  totals: { agent: 12, web: 5, all: 17 },
  daily_trend: [],
};

describe('getCapabilityUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the per-capability counts and sorts categories heaviest first', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(usagePayload), { status: 200 }),
    );

    const result = await getCapabilityUsage(30);

    // The re-export wrapper applies its default options object before
    // the request leaves, so the recorded call carries an empty {}.
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/capability-usage?days=30',
      {},
    );
    expect(result.totals).toEqual({ agent: 12, web: 5, all: 17 });
    expect(result.byCategory).toEqual([
      { category: 'coding', count: 12 },
      { category: 'research', count: 5 },
    ]);
    expect(result.windowDays).toBe(30);
  });

  it('defaults the window to 30 days', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(usagePayload), { status: 200 }),
    );

    await getCapabilityUsage();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/capability-usage?days=30',
      {},
    );
  });

  it('rejects out-of-range windows before any request is made', async () => {
    await expect(getCapabilityUsage(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    await expect(getCapabilityUsage(366)).rejects.toThrow(RangeError);
    await expect(getCapabilityUsage(7.5)).rejects.toThrow(RangeError);
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces a rate-limit refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many capability-usage requests. Limit is 60 per hour.' },
        }),
        { status: 429, headers: { 'X-Request-ID': 'req-cap-1' } },
      ),
    );

    await expect(getCapabilityUsage(30)).rejects.toThrow(
      'Too many capability-usage requests. Limit is 60 per hour. (Request ID: req-cap-1)',
    );
  });
});
