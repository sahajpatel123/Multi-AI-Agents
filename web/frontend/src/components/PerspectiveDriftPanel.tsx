import { useCallback, useEffect, useState } from 'react';
import {
  getRoomPerspectiveDrift,
  type PerspectiveDriftResponse,
} from '../api';

function DriftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19l5-5 4 3 7-9"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 8h4v4"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return '#D85A30';
  if (score >= 40) return '#C4956A';
  if (score >= 15) return '#8B7355';
  return '#6B8F71';
}

type Props = {
  slug: string;
  taskCount: number;
};

/** Room board panel: how much research viewpoints diverge across shared tasks. */
export function PerspectiveDriftPanel({ slug, taskCount }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerspectiveDriftResponse | null>(null);

  const load = useCallback(async () => {
    if (!slug || taskCount < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getRoomPerspectiveDrift(slug);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load perspective drift');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [slug, taskCount]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  if (taskCount < 2) return null;

  const score = data?.drift_score ?? null;
  const accent = score != null ? scoreColor(score) : '#C4956A';

  return (
    <div
      style={{
        background: '#FAF7F2',
        border: '0.5px solid #E0D5C5',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: '#2C1810',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C4956A' }}>
          <DriftIcon />
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Perspective drift
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {score != null && open ? (
            <span
              style={{
                fontSize: 10,
                background: 'rgba(196,149,106,0.15)',
                color: accent,
                border: `0.5px solid ${accent}`,
                borderRadius: 8,
                padding: '4px 10px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {score}/100 · {data?.label}
            </span>
          ) : null}
          <span style={{ color: '#C4956A', fontSize: 12 }} aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </div>
      </button>

      {open ? (
        <div style={{ padding: '14px 16px 16px' }}>
          {loading && !data ? (
            <div style={{ fontSize: 13, color: '#A89070', fontStyle: 'italic' }}>
              Comparing viewpoints across room tasks…
            </div>
          ) : null}

          {error ? (
            <div role="alert" style={{ fontSize: 13, color: '#993C1D' }}>
              {error}
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  marginLeft: 10,
                  background: 'none',
                  border: '0.5px solid #D4C4B0',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 11,
                  color: '#C4956A',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {data && !error ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 28,
                    fontFamily: 'Georgia, serif',
                    color: accent,
                    lineHeight: 1,
                  }}
                >
                  {data.drift_score}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#8B7355',
                    }}
                  >
                    {data.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#A89070', marginTop: 2 }}>
                    Across {data.task_count} tasks
                    {data.mean_similarity != null
                      ? ` · mean overlap ${(data.mean_similarity * 100).toFixed(0)}%`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  title="Refresh drift analysis"
                  aria-label="Refresh drift analysis"
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: '0.5px solid #D4C4B0',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#C4956A',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  Refresh
                </button>
              </div>

              {data.message ? (
                <div style={{ fontSize: 13, color: '#A89070', fontStyle: 'italic' }}>{data.message}</div>
              ) : null}

              {data.perspective_clusters.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A89070',
                      marginBottom: 6,
                      letterSpacing: '0.06em',
                    }}
                  >
                    Viewpoint clusters
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.perspective_clusters.map((c, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#F5EDE3',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 8,
                          padding: '10px 12px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: '#4A3728',
                            fontFamily: 'Georgia, serif',
                            marginBottom: 4,
                          }}
                        >
                          {c.theme}
                          <span style={{ color: '#A89070', fontSize: 11, marginLeft: 8 }}>
                            {c.size} task{c.size === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8B7355' }}>
                          {c.members.map((m) => m.user).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.divergent_pairs.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A89070',
                      marginBottom: 6,
                      letterSpacing: '0.06em',
                    }}
                  >
                    Sharpest divergences
                  </div>
                  {data.divergent_pairs.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#FDF5F0',
                        borderLeft: '3px solid #D85A30',
                        borderRadius: 6,
                        padding: '10px 12px',
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          textTransform: 'uppercase',
                          color: '#D85A30',
                          marginBottom: 6,
                        }}
                      >
                        {p.task_a.user} vs {p.task_b.user} ·{' '}
                        {(p.similarity * 100).toFixed(0)}% overlap
                      </div>
                      <div style={{ fontSize: 12, color: '#2C1810', lineHeight: 1.45 }}>
                        {p.task_a.snippet || '—'}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#A89070',
                          fontStyle: 'italic',
                          margin: '4px 0',
                        }}
                      >
                        vs
                      </div>
                      <div style={{ fontSize: 12, color: '#2C1810', lineHeight: 1.45 }}>
                        {p.task_b.snippet || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!data.message &&
              data.perspective_clusters.length === 0 &&
              data.divergent_pairs.length === 0 ? (
                <div style={{ fontSize: 13, color: '#A89070', fontStyle: 'italic' }}>
                  Not enough answer text yet to cluster viewpoints.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
