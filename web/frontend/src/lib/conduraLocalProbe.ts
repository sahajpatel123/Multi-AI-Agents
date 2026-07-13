import type { ConduraProbeState } from '../types/condura';

const CONDURA_URL = 'http://127.0.0.1:18600/api';
const PROBE_TIMEOUT_MS = 800;

/**
 * Opt-in probe only. Touches 127.0.0.1 exclusively.
 * Reports categorical state — never ports/paths beyond readiness.
 */
export async function probeLocalCondura(): Promise<ConduraProbeState> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(CONDURA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {},
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { kind: 'installed_not_running' };
    }
    const data = (await res.json().catch(() => null)) as {
      result?: { pong?: boolean; version?: string };
      error?: unknown;
    } | null;
    if (data?.result?.pong || data?.result) {
      return {
        kind: 'ready',
        version: typeof data.result?.version === 'string' ? data.result.version : undefined,
      };
    }
    if (data?.error) {
      return { kind: 'installed_not_running' };
    }
    return { kind: 'installed_not_running' };
  } catch {
    return { kind: 'not_installed' };
  } finally {
    window.clearTimeout(timer);
  }
}
