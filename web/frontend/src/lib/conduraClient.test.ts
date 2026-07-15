import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConduraClientError, dispatchHandoff } from './conduraClient';
import type { HandoffPayload } from '../types/condura';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const minimalPayload = {
  schema: 'arena.handoff.v1',
  schema_min: '1.0',
  from: {
    product: 'arena',
    instance_id: 'i',
    user_id_hmac: 'h',
    session_id: 's',
  },
  intent: { capability: 'app.open_in_linear', summary: 't', args: {} },
  auth: {
    public_key_jwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
    nonce: 'n',
    issued_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-01-02T00:00:00Z',
    canonicalization: 'rfc8785',
    signature: 'sig',
  },
  deprecation_warnings: [],
} as unknown as HandoffPayload;

describe('dispatchHandoff', () => {
  it('returns run_id on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { run_id: 'run-1', status: 'accepted' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const out = await dispatchHandoff(minimalPayload);
    expect(out.run_id).toBe('run-1');
    expect(out.status).toBe('accepted');
  });

  it('throws daemon_unreachable when Condura is down (no fake success)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(dispatchHandoff(minimalPayload)).rejects.toMatchObject({
      name: 'ConduraClientError',
      kind: 'daemon_unreachable',
    });
  });

  it('maps Condura RPC error kinds honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Device not paired',
              data: { kind: 'unknown_device' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    try {
      await dispatchHandoff(minimalPayload);
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConduraClientError);
      expect((e as ConduraClientError).kind).toBe('unknown_device');
    }
  });
});
