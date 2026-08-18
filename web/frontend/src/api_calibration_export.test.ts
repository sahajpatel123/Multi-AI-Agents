import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportCalibrationHistoryCsv,
  exportCalibrationHistoryJson,
  exportCalibrationHistoryMarkdown,
  getCalibrationHistory,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Calibration history export helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the calibration CSV endpoint and returns the server filename', async () => {
    const mockBlob = new Blob(
      ['task_id,user_rating\n2026-08-01,80\n'],
      { type: 'text/csv' },
    );
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-calibration-7-20260812.csv"',
        },
      }),
    );

    const res = await exportCalibrationHistoryCsv();
    expect(res.blob).toBeInstanceOf(Blob);
    expect(res.filename).toBe('arena-calibration-7-20260812.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/calibration/history/export.csv',
      {},
    );
  });

  it('falls back to a fixed filename for CSV when Content-Disposition is missing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['task_id\n'], { type: 'text/csv' }), {
        status: 200,
      }),
    );

    const res = await exportCalibrationHistoryCsv();
    expect(res.blob).toBeInstanceOf(Blob);
    expect(res.filename).toBe('arena-calibration-history.csv');
  });

  it('fetches the calibration JSON endpoint and returns the server filename', async () => {
    const mockBlob = new Blob(['[{"task_id":"task-1"}]'], {
      type: 'application/json',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-calibration-7-20260812.json"',
        },
      }),
    );

    const res = await exportCalibrationHistoryJson();
    expect(res.blob).toBeInstanceOf(Blob);
    expect(res.filename).toBe('arena-calibration-7-20260812.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/calibration/history/export.json',
      {},
    );
  });

  it('falls back to a fixed filename when Content-Disposition is missing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['[]'], { type: 'application/json' }), {
        status: 200,
      }),
    );

    const res = await exportCalibrationHistoryJson();
    expect(res.filename).toBe('arena-calibration.json');
  });

  it('fetches the calibration Markdown endpoint and returns the server filename', async () => {
    const mockBlob = new Blob(['# Arena — confidence calibration'], {
      type: 'text/markdown',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-calibration-7-20260812.md"',
        },
      }),
    );

    const res = await exportCalibrationHistoryMarkdown();
    expect(res.blob).toBeInstanceOf(Blob);
    expect(res.filename).toBe('arena-calibration-7-20260812.md');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/calibration/history/export.md',
      {},
    );
  });

  it('surfaces request IDs on Markdown failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), {
        status: 429,
        headers: { 'x-request-id': 'req-cal-md' },
      }),
    );

    await expect(exportCalibrationHistoryMarkdown()).rejects.toMatchObject({
      status: 429,
      message: 'boom (Request ID: req-cal-md)',
    });
  });

  it('surfaces request IDs on CSV failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), {
        status: 429,
        headers: { 'x-request-id': 'req-cal-csv' },
      }),
    );

    await expect(exportCalibrationHistoryCsv()).rejects.toMatchObject({
      status: 429,
      message: 'boom (Request ID: req-cal-csv)',
    });
  });

  it('surfaces request IDs on JSON failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), {
        status: 429,
        headers: { 'x-request-id': 'req-cal-json' },
      }),
    );

    await expect(exportCalibrationHistoryJson()).rejects.toMatchObject({
      status: 429,
      message: 'boom (Request ID: req-cal-json)',
    });
  });

  it('loads a typed, paginated history page with the requested sort', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ratings: [
            {
              id: 3,
              task_id: 'task-3',
              user_rating: 4,
              system_score: 90,
              delta: 10,
              verdict: 'Well calibrated',
              created_at: '2026-08-11T10:00:00Z',
            },
          ],
          total: 6,
          page: 2,
          per_page: 5,
          total_pages: 2,
          filters: { min_delta: null, max_delta: null, sort: 'delta_desc' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getCalibrationHistory({ page: 2, perPage: 5, sort: 'delta_desc' });
    expect(result.ratings[0].task_id).toBe('task-3');
    expect(result.total_pages).toBe(2);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/calibration/history?page=2&per_page=5&sort=delta_desc',
      {},
    );
  });

  it('surfaces request IDs when history loading fails', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'history unavailable' }), {
        status: 503,
        headers: { 'x-request-id': 'req-cal-history' },
      }),
    );

    await expect(getCalibrationHistory()).rejects.toMatchObject({
      status: 503,
      message: 'history unavailable (Request ID: req-cal-history)',
    });
  });
});
