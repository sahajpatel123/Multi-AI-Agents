import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeLocalCondura } from './conduraLocalProbe';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('probeLocalCondura', () => {
  it('returns ready when daemon pongs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { pong: true, version: '1.2.3' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const state = await probeLocalCondura();
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      expect(state.version).toBe('1.2.3');
    }
  });

  it('returns not_installed when fetch fails (honest unavailable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const state = await probeLocalCondura();
    expect(state.kind).toBe('not_installed');
  });

  it('returns installed_not_running on non-OK HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    );
    const state = await probeLocalCondura();
    expect(state.kind).toBe('installed_not_running');
  });
});
