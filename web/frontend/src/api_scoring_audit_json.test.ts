import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportScoringAuditJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Scoring audit JSON export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a URL-encoded session export with its limit', async () => {
    const blob = new Blob(['{"session_id":"session/1"}'], {
      type: 'application/json',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(blob, { status: 200 }),
    );

    const result = await exportScoringAuditJson('session/1', 12);

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/analytics/scoring-audit/session%2F1/export.json?limit=12',
      {},
    );
    expect(Object.prototype.toString.call(result)).toBe('[object Blob]');
  });

  it('surfaces request IDs when the export is rejected', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Too many JSON exports' } }), {
        status: 429,
        headers: { 'x-request-id': 'req-audit-json' },
      }),
    );

    await expect(exportScoringAuditJson('session-1')).rejects.toMatchObject({
      status: 429,
      message: 'Too many JSON exports (Request ID: req-audit-json)',
    });
  });
});
