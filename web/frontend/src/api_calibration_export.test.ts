import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportCalibrationHistoryCsv, exportCalibrationHistoryJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Calibration history export helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the calibration CSV endpoint and returns a blob', async () => {
    const mockBlob = new Blob(
      ['task_id,user_rating\n2026-08-01,80\n'],
      { type: 'text/csv' },
    );
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 }),
    );

    const res = await exportCalibrationHistoryCsv();
    expect(res).toBeInstanceOf(Blob);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/calibration/history/export.csv',
      {},
    );
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
});
