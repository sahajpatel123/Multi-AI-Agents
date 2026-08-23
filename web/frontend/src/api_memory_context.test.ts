import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMemoryContext } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getMemoryContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the context endpoint and normalizes every list', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          task_count: 12,
          recent_tasks: [
            { task: 'Compare EV subsidies across EU states', score: 8.4, created_at: '2026-08-20T10:00:00Z' },
            { task: 'Draft launch checklist', score: null, created_at: '' },
            null,
          ],
          top_topics: ['ev-policy', 'launch', '', 42],
          unresolved_contradictions: [
            { summary: 'Previously said rollout was Q3, later said Q4.', severity: 'medium' },
            { summary: '' },
          ],
        }),
        { status: 200 },
      ),
    );

    const ctx = await getMemoryContext();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/memory/context?task=', {});
    expect(ctx).toEqual({
      taskCount: 12,
      recentTasks: [
        {
          task: 'Compare EV subsidies across EU states',
          score: 8.4,
          createdAt: '2026-08-20T10:00:00Z',
        },
        { task: 'Draft launch checklist', score: null, createdAt: '' },
      ],
      topTopics: ['ev-policy', 'launch'],
      unresolvedContradictions: [
        { summary: 'Previously said rollout was Q3, later said Q4.', severity: 'medium' },
        { summary: '', severity: '' },
      ],
    });
  });

  it('coerces a malformed payload into safe defaults instead of crashing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ task_count: 'lots' }), { status: 200 }),
    );

    const ctx = await getMemoryContext();

    expect(ctx).toEqual({
      taskCount: 0,
      recentTasks: [],
      topTopics: [],
      unresolvedContradictions: [],
    });
  });

  it('surfaces the rate-limit refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many memory-context lookups. Please slow down.' } }),
        { status: 429, headers: { 'X-Request-ID': 'req-mem-1' } },
      ),
    );

    await expect(getMemoryContext()).rejects.toThrow(
      'Too many memory-context lookups. Please slow down. (Request ID: req-mem-1)',
    );
  });
});
