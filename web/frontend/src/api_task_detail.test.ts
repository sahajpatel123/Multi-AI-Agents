import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAgentTaskDetail } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getAgentTaskDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the detail endpoint and keeps contradictions verbatim', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          task: { task_id: 'task-9', title: 'EV policy brief', final_answer: '…' },
          insight_report: null,
          contradictions: [
            {
              id: 3,
              direction: 'new',
              other_task_id: 'task-2',
              summary: 'Said rollout was Q3 before, now says Q4.',
              severity: 'medium',
              resolved: false,
              created_at: '2026-08-20T10:00:00Z',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const detail = await getAgentTaskDetail('task-9');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/tasks/task-9/detail', {});
    expect(detail.contradictions).toHaveLength(1);
    expect(detail.contradictions[0]).toMatchObject({
      id: 3,
      direction: 'new',
      severity: 'medium',
      resolved: false,
    });
    expect(detail.insight_report).toBeNull();
  });

  it('rejects payloads without a task id instead of returning junk', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ task: {} }), { status: 200 }),
    );

    await expect(getAgentTaskDetail('task-404')).rejects.toThrow(
      /Empty or invalid task detail response/,
    );
  });

  it('surfaces refusals verbatim with their request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Task not found' } }), {
        status: 404,
        headers: { 'X-Request-ID': 'req-detail-1' },
      }),
    );

    await expect(getAgentTaskDetail('gone')).rejects.toThrow(
      'Task not found (Request ID: req-detail-1)',
    );
  });
});
