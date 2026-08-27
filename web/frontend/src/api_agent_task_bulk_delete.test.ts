import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAgentTasks } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('deleteAgentTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the requested ids and preserves partial-success details', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          requested: 3,
          deleted: 2,
          deleted_ids: ['task-a', 'task-b'],
          skipped_ids: ['task-c'],
        }),
        { status: 200 },
      ),
    );

    await expect(deleteAgentTasks(['task-a', 'task-b', 'task-c'])).resolves.toEqual({
      success: true,
      requested: 3,
      deleted: 2,
      deleted_ids: ['task-a', 'task-b'],
      skipped_ids: ['task-c'],
    });
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/tasks/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['task-a', 'task-b', 'task-c'] }),
    });
  });

  it('drops malformed id entries instead of returning non-string ids', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          requested: 1,
          deleted: 1,
          deleted_ids: ['task-a', 42, null],
          skipped_ids: [false, 'task-b'],
        }),
        { status: 200 },
      ),
    );

    await expect(deleteAgentTasks(['task-a'])).resolves.toMatchObject({
      deleted_ids: ['task-a'],
      skipped_ids: ['task-b'],
    });
  });

  it('surfaces refusal messages with their request id', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Too many bulk deletions' } }), {
        status: 429,
        headers: { 'x-request-id': 'req-bulk-delete' },
      }),
    );

    await expect(deleteAgentTasks(['task-a'])).rejects.toMatchObject({
      status: 429,
      message: 'Too many bulk deletions (Request ID: req-bulk-delete)',
    });
  });

  it('rejects a successful response without deletion arrays', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, requested: 1, deleted: 1 }), {
        status: 200,
      }),
    );

    await expect(deleteAgentTasks(['task-a'])).rejects.toThrow(
      'Invalid bulk delete response',
    );
  });
});
