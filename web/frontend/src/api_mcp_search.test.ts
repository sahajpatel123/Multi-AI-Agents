import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchMcpIntegration } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('searchMcpIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs the trimmed query and normalizes the unified results', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Launch checklist',
              excerpt: 'https://notion.so/launch',
              source: 'Notion',
              url: 'https://notion.so/launch',
            },
            null,
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchMcpIntegration(7, '  launch  ');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/mcp/integrations/7/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'launch' }),
    });
    expect(results).toEqual([
      {
        title: 'Launch checklist',
        excerpt: 'https://notion.so/launch',
        source: 'Notion',
        url: 'https://notion.so/launch',
      },
    ]);
  });

  it('rejects bad ids and empty queries before any request is made', async () => {
    await expect(searchMcpIntegration(0, 'x')).rejects.toThrow(
      'integrationId must be a positive integer',
    );
    await expect(searchMcpIntegration(7, '   ')).rejects.toThrow('query must not be empty');
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces the not-found refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Integration not found' } }), {
        status: 404,
        headers: { 'X-Request-ID': 'req-mcp-1' },
      }),
    );

    await expect(searchMcpIntegration(99, 'launch')).rejects.toThrow(
      'Integration not found (Request ID: req-mcp-1)',
    );
  });

  it('surfaces the hourly rate-limit refusal verbatim', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many integration searches. Please try again later.' } }),
        { status: 429, headers: { 'X-Request-ID': 'req-mcp-2' } },
      ),
    );

    await expect(searchMcpIntegration(7, 'launch')).rejects.toThrow(
      'Too many integration searches. Please try again later. (Request ID: req-mcp-2)',
    );
  });
});
