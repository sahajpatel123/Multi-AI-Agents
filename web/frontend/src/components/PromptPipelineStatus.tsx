import { useCallback, useEffect, useState } from 'react';
import { getPromptReadiness, type PromptReadiness } from '../api';

/**
 * Live readiness of the prompt pipeline (db, short-term memory, route
 * wiring), surfaced where prompts are composed. Self-contained: one
 * fetch on mount, an explicit Refresh, and an aria-live announcement
 * so status swaps are heard. Degraded is data from a 503, not an error.
 */
export function PromptPipelineStatus() {
  const [status, setStatus] = useState<PromptReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void getPromptReadiness()
      .then((next) => {
        setStatus(next);
      })
      .catch((err: unknown) => {
        setStatus(null);
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Prompt pipeline status unavailable.',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const failing = status ? status.checks.filter((check) => check.state !== 'ok') : [];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Prompt pipeline status"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}
    >
      {loading ? (
        <span style={{ fontSize: 11, color: '#A0A39A' }}>Checking prompt pipeline…</span>
      ) : error ? (
        <>
          <span role="alert" style={{ fontSize: 11, color: '#993C1D' }}>
            {error}
          </span>
          <button
            type="button"
            aria-label="Retry prompt pipeline status"
            onClick={load}
            style={{
              padding: '3px 9px',
              borderRadius: 6,
              border: '0.5px solid #E0D5C5',
              background: '#F0E8DC',
              color: '#5A4A32',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'var(--vp-font-sans)',
            }}
          >
            Retry
          </button>
        </>
      ) : status && status.ok ? (
        <span style={{ fontSize: 11, color: '#3F6B4A', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: '#3F6B4A', display: 'inline-block' }} />
          Prompt pipeline ready
        </span>
      ) : status ? (
        <span style={{ fontSize: 11, color: '#9C2F2A', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: '#9C2F2A', display: 'inline-block' }} />
          Prompt pipeline degraded
          {failing.length > 0 ? (
            <span style={{ color: '#993C1D', wordBreak: 'break-word' }}>
              ({failing.map((check) => `${check.name}: ${check.state}`).join(' · ')})
            </span>
          ) : null}
        </span>
      ) : null}
      {!loading ? (
        <button
          type="button"
          aria-label="Refresh prompt pipeline status"
          title="Re-check prompt pipeline readiness"
          onClick={load}
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            color: '#F0B84E',
            fontSize: 11,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}
