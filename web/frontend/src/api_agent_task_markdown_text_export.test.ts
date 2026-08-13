import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAgentTaskMarkdownText } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent task Markdown text export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the task Markdown export endpoint and returns the report text', async () => {
    const report = '# Arena Agent\n\n**Question:** Test\n';
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(report, {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      }),
    );

    const text = await fetchAgentTaskMarkdownText('task-123');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/task-123/export.md',
      {},
    );
    expect(text).toBe(report);
  });

  it('encodes task ids with reserved characters', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('# Report', { status: 200 }),
    );

    await fetchAgentTaskMarkdownText('a/b?c');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/a%2Fb%3Fc/export.md',
      {},
    );
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many task Markdown exports' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-md-export' },
        },
      ),
    );

    await expect(fetchAgentTaskMarkdownText('task-123')).rejects.toMatchObject({
      status: 429,
      message: 'Too many task Markdown exports (Request ID: req-md-export)',
    });
  });
});
