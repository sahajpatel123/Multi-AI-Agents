import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAgentCapabilities, getCapabilityDoc } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getAgentCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the taxonomy alphabetized regardless of registry order', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          request_id: 'req-caps-1',
          capabilities: [
            {
              id: 'web.search',
              description: 'Search the web.',
              execution: 'server',
            },
            { id: 'arena.respond', description: 'Four-agent panel response.', execution: 'local' },
            {
              id: 'file.organize',
              description: 'Organize files.',
              execution: 'server',
              condura_method: 'organize',
            },
          ],
        }),
        // The re-export wrapper applies its default options object.
        { status: 200 },
      ),
    );

    const result = await getAgentCapabilities();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/capabilities', {});
    expect(result.map((cap) => cap.id)).toEqual([
      'arena.respond',
      'file.organize',
      'web.search',
    ]);
  });

  it('drops entries without a usable id instead of rendering blanks', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ capabilities: [{ id: '', description: 'x' }, {}] }), {
        status: 200,
      }),
    );

    const result = await getAgentCapabilities();

    expect(result).toEqual([]);
  });

  it('surfaces a refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many capability lookups. Please slow down.' } }),
        { status: 429, headers: { 'X-Request-ID': 'req-caps-2' } },
      ),
    );

    await expect(getAgentCapabilities()).rejects.toThrow(
      'Too many capability lookups. Please slow down. (Request ID: req-caps-2)',
    );
  });
});

describe('getCapabilityDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches one capability doc by id and normalizes the fields', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          request_id: 'req-doc-1',
          id: 'arena.respond',
          description: 'Four-agent panel response.',
          execution: 'local',
          markdown: '**Four-agent panel response.**\n\nDetails here.',
        }),
        { status: 200 },
      ),
    );

    const result = await getCapabilityDoc('arena.respond');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/capabilities/docs/arena.respond',
      {},
    );
    expect(result.markdown).toBe('**Four-agent panel response.**\n\nDetails here.');
    expect(result.execution).toBe('local');
  });

  it('rejects empty ids before any request is made', async () => {
    await expect(getCapabilityDoc('   ')).rejects.toThrow('capabilityId must not be empty');
    expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
  });

  it('falls back to a clear message when the backend 404 carries no human text', async () => {
    // The backend answers unknown ids with
    // {error: capability_not_found} — no message field — so the wrapper's
    // fallback wording is what surfaces.
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { error: 'capability_not_found', id: 'nope.typo' } }),
        { status: 404, headers: { 'X-Request-ID': 'req-doc-2' } },
      ),
    );

    await expect(getCapabilityDoc('nope.typo')).rejects.toThrow(
      'Failed to load that capability doc (Request ID: req-doc-2)',
    );
  });
});
