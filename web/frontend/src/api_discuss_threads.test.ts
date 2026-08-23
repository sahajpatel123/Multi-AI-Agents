import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deleteDiscussThread,
  getDiscussThread,
  listDiscussThreads,
  saveDiscussThread,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

const threadRow = {
  id: 7,
  agent_id: 'claude-sonnet',
  title: 'Why did the migration fail?',
  last_message_at: '2026-08-23T07:30:00',
  created_at: '2026-08-23T07:00:00',
  message_count: 2,
};

const fullThreadRow = {
  ...threadRow,
  messages: [
    { role: 'user', content: 'Why did the migration fail?', timestamp: '2026-08-23T07:00:00' },
    { role: 'agent', content: 'The lock table was stale.', timestamp: '2026-08-23T07:30:00' },
  ],
  original_prompt: 'Why did the migration fail?',
  original_verdict: 'Stale lock table.',
};

describe('discuss thread API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveDiscussThread', () => {
    it('POSTs the snake_case body and returns the normalized thread', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'saved', id: 7, thread: fullThreadRow }), {
          status: 200,
        }),
      );

      const thread = await saveDiscussThread({
        agentId: 'claude-sonnet',
        title: 'Why did the migration fail?',
        messages: [
          { role: 'user', content: 'Why did the migration fail?', timestamp: '2026-08-23T07:00:00' },
        ],
        originalPrompt: 'Why did the migration fail?',
        originalVerdict: 'Stale lock table.',
      });

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/discuss/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: 'claude-sonnet',
          title: 'Why did the migration fail?',
          messages: [
            { role: 'user', content: 'Why did the migration fail?', timestamp: '2026-08-23T07:00:00' },
          ],
          original_prompt: 'Why did the migration fail?',
          original_verdict: 'Stale lock table.',
        }),
      });
      expect(thread.id).toBe(7);
      expect(thread.agentId).toBe('claude-sonnet');
      expect(thread.messages).toHaveLength(2);
      expect(thread.messages[1]).toEqual({
        role: 'agent',
        content: 'The lock table was stale.',
        timestamp: '2026-08-23T07:30:00',
      });
      expect(thread.originalVerdict).toBe('Stale lock table.');
    });

    it('rejects invalid input before any request', async () => {
      await expect(
        saveDiscussThread({ agentId: '  ', messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toThrow('agentId must not be empty');
      await expect(saveDiscussThread({ agentId: 'claude-sonnet', messages: [] })).rejects.toThrow(
        'messages must contain at least one entry',
      );
      await expect(
        saveDiscussThread({
          agentId: 'claude-sonnet',
          title: 'x'.repeat(256),
          messages: [{ role: 'user', content: 'x' }],
        }),
      ).rejects.toThrow('title must be at most 255 characters');
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces the tier-gate refusal with its message and request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              error: 'feature_not_allowed',
              message: 'Discuss requires a Plus or Pro subscription.',
            },
          }),
          { status: 403, headers: { 'x-request-id': 'req-save-403' } },
        ),
      );

      await expect(
        saveDiscussThread({ agentId: 'claude-sonnet', messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toThrow(
        'Discuss requires a Plus or Pro subscription. (Request ID: req-save-403)',
      );
    });

    it('rejects a malformed success payload', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'saved', id: 7 }), { status: 200 }),
      );
      await expect(
        saveDiscussThread({ agentId: 'claude-sonnet', messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toThrow('unexpected shape');
    });
  });

  describe('listDiscussThreads', () => {
    it('builds the query string and normalizes the envelope', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [threadRow],
            total: 1,
            page: 1,
            per_page: 20,
            total_pages: 1,
            filters: { agent_id: null, search: null },
          }),
          { status: 200 },
        ),
      );

      const result = await listDiscussThreads({ page: 1, perPage: 20, search: 'migration' });
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/discuss/threads?page=1&per_page=20&search=migration',
        {},
      );
      expect(result.threads).toEqual([
        {
          id: 7,
          agentId: 'claude-sonnet',
          title: 'Why did the migration fail?',
          lastMessageAt: '2026-08-23T07:30:00',
          createdAt: '2026-08-23T07:00:00',
          messageCount: 2,
        },
      ]);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('omits the query string when no filters are given', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ threads: [], total: 0, total_pages: 0 }), { status: 200 }),
      );
      await listDiscussThreads();
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/discuss/threads', {});
    });
  });

  describe('getDiscussThread', () => {
    it('normalizes the full thread and defaults missing timestamps', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...fullThreadRow,
            messages: [
              { role: 'admin', content: 'dropped role' },
              { role: 'agent', content: 'kept' },
            ],
          }),
          { status: 200 },
        ),
      );

      const thread = await getDiscussThread(7);
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/discuss/threads/7', {});
      // Only the {user, agent} allowlist survives normalization — anything
      // else reads as the user's side rather than an unknown authority.
      expect(thread.messages[0].role).toBe('user');
      expect(thread.messages[1].role).toBe('agent');
      expect(thread.messageCount).toBe(2);
    });

    it('rejects invalid ids before any request', async () => {
      await expect(getDiscussThread(0)).rejects.toThrow(RangeError);
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('deleteDiscussThread', () => {
    it('DELETEs the thread and resolves void on success', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'deleted', id: 7 }), { status: 200 }),
      );
      await expect(deleteDiscussThread(7)).resolves.toBeUndefined();
      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/discuss/threads/7', {
        method: 'DELETE',
      });
    });

    it('surfaces delete failures with their message and request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Too many thread deletes. Limit is 60 per hour.' }), {
          status: 429,
          headers: { 'x-request-id': 'req-del-429' },
        }),
      );
      await expect(deleteDiscussThread(7)).rejects.toThrow(
        'Too many thread deletes. Limit is 60 per hour. (Request ID: req-del-429)',
      );
    });
  });
});
