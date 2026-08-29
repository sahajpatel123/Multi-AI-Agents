import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportAgentOrchestrationsCsv,
  exportAgentOrchestrationsJson,
  exportAgentOrchestrationsMarkdown,
  exportOrchestrationJson,
  exportOrchestrationMarkdown,
  fetchAgentOrchestrationsMarkdownText,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('single Agent orchestration Markdown export helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes the orchestration ID and returns a non-empty Markdown blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('# Arena orchestration report\n', {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      }),
    );

    const blob = await exportOrchestrationMarkdown('orch/id 1');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrate/orch%2Fid%201/export.md',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/markdown;charset=utf-8');
  });

  it('rejects an empty successful response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('  \n', { status: 200 }),
    );

    await expect(exportOrchestrationMarkdown('orch-1')).rejects.toThrow(
      'Empty orchestration Markdown returned by the server',
    );
  });

  it('surfaces the request ID on a failed export', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Orchestration not found' } }), {
        status: 404,
        headers: { 'x-request-id': 'req-single-orch-md' },
      }),
    );

    await expect(exportOrchestrationMarkdown('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Orchestration not found (Request ID: req-single-orch-md)',
    });
  });
});

describe('single Agent orchestration JSON export helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes the orchestration ID and returns a validated JSON blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'orch/id 1',
          status: 'complete',
          created_at: '2026-08-29T09:30:00+00:00',
          task_count: 1,
          task_ids: ['task-1'],
          synthesis: 'Combined result',
          synthesis_bullets: ['Supported point'],
          conflicts: [],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        },
      ),
    );

    const blob = await exportOrchestrationJson('orch/id 1');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrate/orch%2Fid%201/export.json',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/json;charset=utf-8');
  });

  it('rejects empty and malformed successful responses', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('  \n', { status: 200 }),
    );
    await expect(exportOrchestrationJson('orch-1')).rejects.toThrow(
      'Empty orchestration JSON returned by the server',
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('[]', { status: 200 }),
    );
    await expect(exportOrchestrationJson('orch-1')).rejects.toThrow(
      'Invalid orchestration JSON returned by the server',
    );
  });

  it.each([
    [
      'a different orchestration',
      {
        id: 'orch-2',
        status: 'complete',
        created_at: null,
        task_count: 0,
        task_ids: [],
        synthesis: '',
        synthesis_bullets: [],
        conflicts: [],
      },
    ],
    [
      'an incomplete orchestration',
      {
        id: 'orch-1',
        status: 'running',
        created_at: null,
        task_count: 0,
        task_ids: [],
        synthesis: '',
        synthesis_bullets: [],
        conflicts: [],
      },
    ],
    [
      'an inconsistent task count',
      {
        id: 'orch-1',
        status: 'complete',
        created_at: null,
        task_count: 2,
        task_ids: ['task-1'],
        synthesis: '',
        synthesis_bullets: [],
        conflicts: [],
      },
    ],
    [
      'malformed synthesis fields',
      {
        id: 'orch-1',
        status: 'complete',
        created_at: null,
        task_count: 0,
        task_ids: [],
        synthesis: null,
        synthesis_bullets: {},
        conflicts: [],
      },
    ],
  ])('rejects %s returned with a successful status', async (_label, payload) => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'x-request-id': 'req-invalid-orch-json' },
      }),
    );

    await expect(exportOrchestrationJson('orch-1')).rejects.toThrow(
      'Invalid orchestration JSON returned by the server (Request ID: req-invalid-orch-json)',
    );
  });

  it('surfaces the request ID on a failed export', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Orchestration not found' } }), {
        status: 404,
        headers: { 'x-request-id': 'req-single-orch-json' },
      }),
    );

    await expect(exportOrchestrationJson('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Orchestration not found (Request ID: req-single-orch-json)',
    });
  });
});

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
  const validItem = {
    id: 'orch-1',
    status: 'complete',
    created_at: '2026-08-29T09:30:00+00:00',
    task_count: 1,
    task_ids: ['task-1'],
    synthesis: 'Combined result',
    synthesis_bullets: ['Supported point'],
    conflicts: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches validated orchestration history and returns a non-empty blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify([validItem]), {
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

  it('rejects empty, malformed, or structurally invalid successful responses', async () => {
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

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ ...validItem, task_count: 2 }]), { status: 200 }),
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

  it('returns Markdown text for direct clipboard sharing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('# Arena orchestration history\n\n## Complete\n', { status: 200 }),
    );

    await expect(fetchAgentOrchestrationsMarkdownText('complete')).resolves.toBe(
      '# Arena orchestration history\n\n## Complete\n',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.md?status=complete',
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

  it('rejects empty clipboard text through the shared validation path', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('   \n', { status: 200 }),
    );

    await expect(fetchAgentOrchestrationsMarkdownText()).rejects.toThrow(
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
