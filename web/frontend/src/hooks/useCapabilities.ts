import { useEffect, useState } from 'react';
import { API_ORIGIN } from '../api';

export type CapabilitySummary = {
  id: string;
  description: string;
  execution: string;
  condura_method?: string;
  stream_heartbeat_seconds?: number;
};

type State = {
  capabilities: CapabilitySummary[];
  loading: boolean;
  error: string | null;
};

const EMPTY: State = { capabilities: [], loading: true, error: null };

/**
 * Fetch and cache the capability catalog.
 *
 * Used by the pricing page, the agent picker, and the integration
 * catalog. The capability list changes rarely (only when a new
 * capability ships), so a per-mount fetch is enough — there's no
 * need to poll. The hook dedupes in-flight requests across
 * simultaneous mounters via a module-level promise cache.
 *
 * Returns { capabilities, loading, error } so callers can render
 * skeletons, error states, and the catalog itself.
 */
let inflight: Promise<CapabilitySummary[]> | null = null;
let cache: CapabilitySummary[] | null = null;

function fetchCapabilities(): Promise<CapabilitySummary[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(`${API_ORIGIN}/api/agent/capabilities`)
    .then(async (r) => {
      if (!r.ok) throw new Error(`capabilities: ${r.status}`);
      const body = (await r.json()) as { capabilities: CapabilitySummary[] };
      cache = body.capabilities;
      inflight = null;
      return cache;
    })
    .catch((err) => {
      inflight = null;
      // Wrap any error (network, parse, our own throw) into a string
      // so the hook's error field is always a renderable message.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg);
    });
  return inflight;
}

export function useCapabilities(): State {
  const [state, setState] = useState<State>(() => ({
    capabilities: cache ?? [],
    loading: cache == null,
    error: null,
  }));

  useEffect(() => {
    if (cache) {
      // Already cached — nothing to fetch.
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchCapabilities()
      .then((capabilities) => {
        if (cancelled) return;
        setState({ capabilities, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // err may be anything — network error, parse error, our own
        // thrown Error. Stringify defensively so error is always a
        // renderable string.
        const message = err instanceof Error ? err.message : String(err);
        setState({ capabilities: [], loading: false, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
