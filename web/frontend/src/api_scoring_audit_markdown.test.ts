import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportScoringAuditMarkdown } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Scoring audit Markdown export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the encoded session export and returns a Blob', async () => {
    const blob = new Blob(['# Arena — scoring audit'], { type: 'text/markdown' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(blob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-scoring-audit-session_md_x.md"',
        },
      }),
    );

    const result = await exportScoringAuditMarkdown('session md x', 7);

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/scoring-audit/session%20md%20x/export.md?limit=7',
      {},
    );
    expect(Object.prototype.toString.call(result)).toBe('[object Blob]');
  });

  it('surfaces request IDs on export failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many scoring audit Markdown exports' } }),
        { status: 429, headers: { 'x-request-id': 'req-audit-md' } },
      ),
    );

    await expect(exportScoringAuditMarkdown('session-1')).rejects.toMatchObject({
      status: 429,
      message: 'Too many scoring audit Markdown exports (Request ID: req-audit-md)',
    });
  });
});
