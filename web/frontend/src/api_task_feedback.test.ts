import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitTaskFeedback } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('submitTaskFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs the verdict with an optional note and returns the saved payload', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'saved', task_id: 't-1', feedback: 'partial' }),
        { status: 200 },
      ),
    );

    const result = await submitTaskFeedback('t-1', 'partial', 'Numbers were off in section 2');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: 't-1',
        feedback: 'partial',
        note: 'Numbers were off in section 2',
      }),
    });
    expect(result).toEqual({ status: 'saved', task_id: 't-1', feedback: 'partial' });
  });

  it('surfaces the refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many feedback submissions. Limit is 120 per hour.' } }),
        { status: 429, headers: { 'X-Request-ID': 'req-fb-1' } },
      ),
    );

    await expect(submitTaskFeedback('t-1', 'inaccurate')).rejects.toThrow(
      'Too many feedback submissions. Limit is 120 per hour. (Request ID: req-fb-1)',
    );
  });

  it('falls back to the plain refusal when the body is unparseable', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(null, { status: 403 }),
    );

    await expect(submitTaskFeedback('t-1', 'accurate')).rejects.toThrow('Feedback failed');
  });

  it('refuses an empty success body instead of pretending it saved', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );

    await expect(submitTaskFeedback('t-1', 'accurate')).rejects.toThrow('Empty feedback response');
  });
});
