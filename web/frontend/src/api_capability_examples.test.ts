import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCapabilityExamples } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getCapabilityExamples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps each capability to its curated prompts, dropping blank strings', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          request_id: 'req-ex-1',
          examples: [
            { id: 'arena.respond', examples: ['Debate this topic', '   ', 'Summarize the news'] },
            { id: 'feedback', examples: [] },
          ],
        }),
        // The re-export wrapper applies its default options object.
        { status: 200 },
      ),
    );

    const result = await getCapabilityExamples();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/capabilities/examples', {});
    expect(result).toEqual([
      { id: 'arena.respond', examples: ['Debate this topic', 'Summarize the news'] },
      { id: 'feedback', examples: [] },
    ]);
  });

  it('tolerates a malformed payload by returning an empty list', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ examples: [{ id: 'x' }, {}, null] }), { status: 200 }),
    );

    const result = await getCapabilityExamples();

    expect(result).toEqual([{ id: 'x', examples: [] }]);
  });

  it('surfaces a rate-limit refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many capability-example lookups. Please slow down.' },
        }),
        { status: 429, headers: { 'X-Request-ID': 'req-ex-2' } },
      ),
    );

    await expect(getCapabilityExamples()).rejects.toThrow(
      'Too many capability-example lookups. Please slow down. (Request ID: req-ex-2)',
    );
  });
});
