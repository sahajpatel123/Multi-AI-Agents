import type { HandoffPayload } from '../types/condura';

const BASE = 'http://127.0.0.1:18600';

export class ConduraClientError extends Error {
  kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = 'ConduraClientError';
    this.kind = kind;
  }
}

async function jsonRpc<T>(method: string, params: unknown, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ConduraClientError('daemon_unreachable', `Condura HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      result?: T;
      error?: { code?: number; message?: string; data?: { kind?: string } };
    };
    if (data.error) {
      const kind = data.error.data?.kind || 'invalid_payload';
      throw new ConduraClientError(kind, data.error.message || 'Condura error');
    }
    if (data.result === undefined) {
      throw new ConduraClientError('invalid_payload', 'Empty Condura result');
    }
    return data.result;
  } catch (e) {
    if (e instanceof ConduraClientError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ConduraClientError('daemon_timeout', 'Condura did not respond in time');
    }
    throw new ConduraClientError('daemon_unreachable', 'Is Condura running?');
  } finally {
    window.clearTimeout(timer);
  }
}

export async function dispatchHandoff(
  payload: HandoffPayload,
): Promise<{ run_id: string; status: string }> {
  return jsonRpc('arena.handoff', payload);
}

export async function pairDevice(publicKeyJwk: JsonWebKey): Promise<void> {
  await jsonRpc('arena.device.pair', {
    public_key_jwk: publicKeyJwk,
    product: 'arena',
    display_name: 'Arena browser session',
  });
}

/**
 * Open SSE stream for a run. Supports Last-Event-ID resume.
 */
export function openHandoffEventStream(
  runId: string,
  options?: {
    lastEventId?: string;
    onEvent?: (eventId: string | null, data: unknown) => void;
    onError?: (kind: string) => void;
    heartbeatMs?: number;
  },
): { close: () => void } {
  const url = `${BASE}/api/v1/runs/${encodeURIComponent(runId)}/events`;
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (options?.lastEventId) headers['Last-Event-ID'] = options.lastEventId;

  const controller = new AbortController();
  let lastEventAt = Date.now();
  let lastEventId: string | null = options?.lastEventId || null;
  const heartbeatMs = options?.heartbeatMs ?? 60_000;

  const heartbeat = window.setInterval(() => {
    if (Date.now() - lastEventAt > heartbeatMs) {
      options?.onError?.('stream_stalled');
    }
  }, Math.min(15_000, heartbeatMs));

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        options?.onError?.('stream_lost');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          options?.onError?.('terminal_event_missing');
          break;
        }
        lastEventAt = Date.now();
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          let eventId: string | null = null;
          let dataLine = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('id:')) eventId = line.slice(3).trim();
            if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (eventId) lastEventId = eventId;
          if (dataLine) {
            try {
              options?.onEvent?.(eventId, JSON.parse(dataLine));
            } catch {
              options?.onEvent?.(eventId, dataLine);
            }
          }
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        options?.onError?.('stream_lost');
      }
    } finally {
      window.clearInterval(heartbeat);
    }
  })();

  return {
    close: () => {
      window.clearInterval(heartbeat);
      controller.abort();
      void lastEventId;
    },
  };
}
