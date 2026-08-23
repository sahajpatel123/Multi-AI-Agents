import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteCalibrationRating } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('deleteCalibrationRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DELETEs the rating by task id and returns the normalized result', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted', task_id: 'task-9' }), {
        status: 200,
      }),
    );

    const result = await deleteCalibrationRating('task-9');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/calibration/rating/task-9', {
      method: 'DELETE',
    });
    expect(result).toEqual({ status: 'deleted', taskId: 'task-9' });
  });

  it('rejects empty ids before any request is made', async () => {
    await expect(deleteCalibrationRating('   ')).rejects.toThrow('taskId must not be empty');
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces a not-found refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Rating not found' } }),
        { status: 404, headers: { 'X-Request-ID': 'req-cal-del-1' } },
      ),
    );

    await expect(deleteCalibrationRating('task-missing')).rejects.toThrow(
      'Rating not found (Request ID: req-cal-del-1)',
    );
  });

  it('surfaces the rate-limit refusal verbatim', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many calibration deletes. Limit is 60 per hour.' },
        }),
        { status: 429 },
      ),
    );

    await expect(deleteCalibrationRating('task-1')).rejects.toThrow(
      'Too many calibration deletes. Limit is 60 per hour.',
    );
  });
});
