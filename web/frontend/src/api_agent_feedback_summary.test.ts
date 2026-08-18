import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ApiError,
  exportAgentFeedbackSummaryCsv,
  exportAgentFeedbackSummaryJson,
  getAgentFeedbackSummary,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function summaryPayload(windowDays = 7) {
  return {
    total: 4,
    verdicts: { correct: 2, partial: 1, wrong: 1 },
    rate: 0.5,
    window_days: windowDays,
    daily_trend: Array.from({ length: windowDays }, (_, index) => ({
      date: new Date(Date.UTC(2026, 7, 12 + index)).toISOString().slice(0, 10),
      count: index === windowDays - 1 ? 2 : index === windowDays - 2 ? 1 : 0,
    })),
  };
}

describe('Agent feedback summary frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a typed daily trend for the requested window', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(summaryPayload()), { status: 200 }),
    );

    const result = await getAgentFeedbackSummary(7);

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/feedback/summary?window_days=7',
      {},
    );
    expect(result.verdicts.correct).toBe(2);
    expect(result.daily_trend).toHaveLength(7);
  });

  it('uses the 30-day default', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(summaryPayload(30)), { status: 200 }),
    );

    await getAgentFeedbackSummary();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/feedback/summary?window_days=30',
      {},
    );
  });

  it('rejects malformed trends instead of exposing unusable chart data', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...summaryPayload(), daily_trend: [] }),
        { status: 200, headers: { 'x-request-id': 'req-feedback-summary' } },
      ),
    );

    await expect(getAgentFeedbackSummary()).rejects.toMatchObject({
      status: 200,
      message: 'Malformed feedback activity response (Request ID: req-feedback-summary)',
    });
  });

  it('surfaces request IDs on endpoint failure and validates the client range', async () => {
    await expect(getAgentFeedbackSummary(91)).rejects.toThrow(
      'windowDays must be an integer between 1 and 90',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many feedback-summary lookups' } }),
        { status: 429, headers: { 'x-request-id': 'req-feedback-rate' } },
      ),
    );

    const request = getAgentFeedbackSummary(30);
    await expect(request).rejects.toMatchObject({
      status: 429,
      message: 'Too many feedback-summary lookups (Request ID: req-feedback-rate)',
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });

  it('exports the selected feedback activity window and preserves the filename', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['date,feedback_count\n2026-08-17,1\n']), {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-feedback-activity-7-20260818.csv"',
        },
      }),
    );

    const result = await exportAgentFeedbackSummaryCsv(7);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe('arena-feedback-activity-7-20260818.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/feedback/summary/export.csv?window_days=7',
      {},
    );
  });

  it('uses a safe fallback filename and validates the export window', async () => {
    await expect(exportAgentFeedbackSummaryCsv(91)).rejects.toThrow(
      'windowDays must be an integer between 1 and 90',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['date,feedback_count\n']), { status: 200 }),
    );
    const result = await exportAgentFeedbackSummaryCsv();
    expect(result.filename).toBe('arena-feedback-activity-30d.csv');
  });

  it('exports the selected feedback activity window as JSON', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{"window_days":7,"daily_trend":[]}']), {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-feedback-activity-7-20260818.json"',
        },
      }),
    );

    const result = await exportAgentFeedbackSummaryJson(7);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe('arena-feedback-activity-7-20260818.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/feedback/summary/export.json?window_days=7',
      {},
    );
  });

  it('uses a safe JSON fallback filename and validates the export window', async () => {
    await expect(exportAgentFeedbackSummaryJson(91)).rejects.toThrow(
      'windowDays must be an integer between 1 and 90',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{}']), { status: 200 }),
    );
    const result = await exportAgentFeedbackSummaryJson();
    expect(result.filename).toBe('arena-feedback-activity-30d.json');
  });
});
