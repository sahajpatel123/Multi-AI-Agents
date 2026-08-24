import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApiError,
  createAgentTaskShare,
  revokeAgentTaskShare,
  getPublicAgentReport,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

function sharePayload(overrides: Record<string, unknown> = {}) {
  return {
    share_token: 'tok_1234567890abcdef',
    share_url: '/share/agent/tok_1234567890abcdef',
    ...overrides,
  };
}

function reportPayload(overrides: Record<string, unknown> = {}) {
  return {
    token: 'tok_1234567890abcdef',
    title: 'Shareable research',
    question: 'Is this report shareable?',
    answer: 'Yes, with a token and a public page.',
    sources: ['https://example.com/research', 'A published source'],
    final_score: 84,
    final_confidence: 0.75,
    created_at: '2026-08-14T10:00:00',
    shared_at: '2026-08-14T11:00:00',
    ...overrides,
  };
}

describe('Agent report share API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a share and normalizes snake_case fields', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sharePayload()), { status: 200 }),
    );

    const res = await createAgentTaskShare('task-1');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/task-1/share',
      { method: 'POST' },
    );
    expect(res).toEqual({
      shareToken: 'tok_1234567890abcdef',
      shareUrl: '/share/agent/tok_1234567890abcdef',
    });
  });

  it('surfaces backend errors with the request id', async () => {
    const response = new Response(
      JSON.stringify({ detail: { message: 'Only completed reports can be shared.' } }),
      { status: 409, headers: { 'x-request-id': 'req-1' } },
    );
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(response);

    await expect(createAgentTaskShare('task-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Only completed reports can be shared. (Request ID: req-1)',
    });
  });

  it('rejects malformed share payloads', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sharePayload({ share_url: 'https://evil.example' })), {
        status: 200,
      }),
    );
    await expect(createAgentTaskShare('task-1')).rejects.toThrow(
      'Invalid share response',
    );
  });

  it('revokes a share with DELETE', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ revoked: true }), { status: 200 }),
    );

    const res = await revokeAgentTaskShare('task-1');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/task-1/share',
      { method: 'DELETE' },
    );
    expect(res).toEqual({ revoked: true });
  });

  it('rejects a revoke response that is not explicitly true', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ revoked: false }), { status: 200 }),
    );
    await expect(revokeAgentTaskShare('task-1')).rejects.toThrow(
      'Invalid revoke response',
    );
  });

  it('fetches a public report with a sanitized shape', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(reportPayload()), { status: 200 }),
    );

    const res = await getPublicAgentReport('tok_1234567890abcdef');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/public/agent/tok_1234567890abcdef',
      {},
    );
    expect(res).toEqual({
      token: 'tok_1234567890abcdef',
      title: 'Shareable research',
      question: 'Is this report shareable?',
      answer: 'Yes, with a token and a public page.',
      sources: ['https://example.com/research', 'A published source'],
      finalScore: 84,
      finalConfidence: 0.75,
      createdAt: '2026-08-14T10:00:00',
      sharedAt: '2026-08-14T11:00:00',
    });
  });

  it('coerces missing optional report fields to null', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify(reportPayload({ title: null, final_score: null, shared_at: null })),
        { status: 200 },
      ),
    );
    const res = await getPublicAgentReport('tok');
    expect(res.title).toBeNull();
    expect(res.finalScore).toBeNull();
    expect(res.sharedAt).toBeNull();
  });

  it('rejects a public report missing the answer', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(reportPayload({ answer: null })), { status: 200 }),
    );
    await expect(getPublicAgentReport('tok')).rejects.toThrow(
      'Invalid public report response',
    );
  });

  it('throws ApiError with request id on failed public reads', async () => {
    const response = new Response(
      JSON.stringify({ detail: { message: 'Report not found' } }),
      { status: 404, headers: { 'x-request-id': 'req-404' } },
    );
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(response);

    await expect(getPublicAgentReport('missing')).rejects.toMatchObject({
      name: ApiError.name,
      status: 404,
      message: 'Report not found (Request ID: req-404)',
    });
  });
});
