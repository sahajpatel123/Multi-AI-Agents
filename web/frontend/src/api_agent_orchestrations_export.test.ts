import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportAgentOrchestrationsCsv,
  exportAgentOrchestrationsJson,
  exportAgentOrchestrationsMarkdown,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent orchestration history CSV export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches all orchestration history and returns a non-empty blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('id,status,created_at\norch-1,complete,2026-08-28\n', {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' },
      }),
    );

    const blob = await exportAgentOrchestrationsCsv();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.csv',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('encodes an optional orchestration status filter', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('id,status\n', { status: 200 }),
    );

    await exportAgentOrchestrationsCsv('complete');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.csv?status=complete',
      {},
    );
  });

  it('rejects an empty successful response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    await expect(exportAgentOrchestrationsCsv()).rejects.toThrow(
      'Empty orchestration history export returned by the server',
    );
  });

  it('surfaces request IDs when the export is rate limited', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many CSV exports' } }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-orchestration-csv' },
        },
      ),
    );

    await expect(exportAgentOrchestrationsCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many CSV exports (Request ID: req-orchestration-csv)',
    });
  });
});

describe('Agent orchestration history JSON export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches structured orchestration history and returns a non-empty blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('[{"id":"orch-1","status":"complete"}]', {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    const blob = await exportAgentOrchestrationsJson();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.json',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/json;charset=utf-8');
  });

  it('encodes an optional orchestration status filter', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('[]', { status: 200 }),
    );

    await exportAgentOrchestrationsJson('cancelled');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.json?status=cancelled',
      {},
    );
  });

  it('rejects empty or malformed successful responses', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );
    await expect(exportAgentOrchestrationsJson()).rejects.toThrow(
      'Empty orchestration history JSON returned by the server',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('{"items":[]}', { status: 200 }),
    );
    await expect(exportAgentOrchestrationsJson()).rejects.toThrow(
      'Invalid orchestration history JSON returned by the server',
    );
  });

  it('surfaces request IDs when the JSON export is rate limited', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many JSON exports' } }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-orchestration-json' },
        },
      ),
    );

    await expect(exportAgentOrchestrationsJson()).rejects.toMatchObject({
      status: 429,
      message: 'Too many JSON exports (Request ID: req-orchestration-json)',
    });
  });
});

describe('Agent orchestration history Markdown export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches readable orchestration history and returns a non-empty blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('# Arena orchestration history\n', {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      }),
    );

    const blob = await exportAgentOrchestrationsMarkdown();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.md',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/markdown;charset=utf-8');
  });

  it('encodes an optional orchestration status filter', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('# Arena orchestration history\n', { status: 200 }),
    );

    await exportAgentOrchestrationsMarkdown('failed');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.md?status=failed',
      {},
    );
  });

  it('rejects an empty successful response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    await expect(exportAgentOrchestrationsMarkdown()).rejects.toThrow(
      'Empty orchestration history Markdown returned by the server',
    );
  });

  it('surfaces request IDs when the Markdown export is rate limited', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many Markdown exports' } }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-orchestration-md' },
        },
      ),
    );

    await expect(exportAgentOrchestrationsMarkdown()).rejects.toMatchObject({
      status: 429,
      message: 'Too many Markdown exports (Request ID: req-orchestration-md)',
    });
  });
});
