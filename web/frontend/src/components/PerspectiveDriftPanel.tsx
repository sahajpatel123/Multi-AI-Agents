import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRoomPerspectiveDrift,
  type PerspectiveDriftResponse,
} from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration } from '../lib/motion';
import { formatPerspectiveDriftExport } from '../lib/perspectiveDriftExport';

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
  if (score >= 40) return '#F0B84E';
  if (score >= 15) return '#8B7355';
  return '#6B8F71';
}

type Props = {
  slug: string;
  taskCount: number;
  roomName?: string;
};

/** Room board panel: how much research viewpoints diverge across shared tasks. */
export function PerspectiveDriftPanel({ slug, taskCount, roomName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerspectiveDriftResponse | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const copyTimerRef = useRef<number | null>(null);
  const downloadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
    };
  }, []);

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

  const buildMarkdown = useCallback(() => {
    if (!data) return null;
    return formatPerspectiveDriftExport({
      roomName: roomName || slug,
      driftScore: data.drift_score,
      label: data.label,
      taskCount: data.task_count,
      meanSimilarity: data.mean_similarity,
      message: data.message,
      clusters: data.perspective_clusters,
      pairs: data.divergent_pairs,
    });
  }, [data, roomName, slug]);

  const handleCopy = () => {
    const md = buildMarkdown();
    if (!md) return;
    void copyToClipboard(md).then((ok) => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      setCopyStatus(ok ? 'copied' : 'failed');
      const hold = motionDuration(ok ? 2000 : 2800);
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle');
        copyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    });
  };

  const handleDownload = () => {
    const md = buildMarkdown();
    if (!md) return;
    const stem = `perspective-drift-${(roomName || slug || 'room').slice(0, 40)}`;
    const ok = downloadMarkdownFile(md, stem);
    if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
    setDownloadStatus(ok ? 'done' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    downloadTimerRef.current = window.setTimeout(() => {
      setDownloadStatus('idle');
      downloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  if (taskCount < 2) return null;

  const score = data?.drift_score ?? null;
  const accent = score != null ? scoreColor(score) : '#F0B84E';

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
          background: '#F3F0E7',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F0B84E' }}>
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
          <span style={{ color: '#F0B84E', fontSize: 12 }} aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </div>
      </button>

      {open ? (
        <div style={{ padding: '14px 16px 16px' }}>
          {loading && !data ? (
            <div style={{ fontSize: 13, color: '#A0A39A', fontStyle: 'italic' }}>
              Comparing viewpoints across room tasks…
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              style={{
                fontSize: 13,
                color: '#993C1D',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ flex: 1, minWidth: 140 }}>{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  background: 'none',
                  border: '0.5px solid #35382F',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 11,
                  color: '#F0B84E',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#A0A39A',
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          {data && !error ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div
                  style={{
                    fontSize: 28,
                    fontFamily: 'var(--vp-font-sans)',
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
                  <div style={{ fontSize: 12, color: '#A0A39A', marginTop: 2 }}>
                    Across {data.task_count} tasks
                    {data.mean_similarity != null
                      ? ` · mean overlap ${(data.mean_similarity * 100).toFixed(0)}%`
                      : ''}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy drift analysis as markdown"
                    aria-label={
                      copyStatus === 'copied'
                        ? 'Drift analysis copied'
                        : copyStatus === 'failed'
                          ? 'Copy failed'
                          : 'Copy drift analysis as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #35382F',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color:
                        copyStatus === 'failed'
                          ? '#D85A30'
                          : copyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#F0B84E',
                      cursor: 'pointer',
                    }}
                  >
                    {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    title="Download drift analysis as markdown"
                    aria-label={
                      downloadStatus === 'done'
                        ? 'Drift analysis downloaded'
                        : downloadStatus === 'failed'
                          ? 'Download failed'
                          : 'Download drift analysis as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #35382F',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color:
                        downloadStatus === 'failed'
                          ? '#D85A30'
                          : downloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#F0B84E',
                      cursor: 'pointer',
                    }}
                  >
                    {downloadStatus === 'done'
                      ? 'Downloaded'
                      : downloadStatus === 'failed'
                        ? 'Failed'
                        : 'Download .md'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    title="Refresh drift analysis"
                    aria-label="Refresh drift analysis"
                    style={{
                      background: 'none',
                      border: '0.5px solid #35382F',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#F0B84E',
                      cursor: loading ? 'default' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                    }}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {copyStatus !== 'idle' ? (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                  }}
                >
                  {copyStatus === 'copied'
                    ? 'Drift analysis copied to clipboard'
                    : 'Could not copy drift analysis'}
                </div>
              ) : null}

              {data.message ? (
                <div style={{ fontSize: 13, color: '#A0A39A', fontStyle: 'italic' }}>{data.message}</div>
              ) : null}

              {data.perspective_clusters.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A0A39A',
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
                            fontFamily: 'var(--vp-font-sans)',
                            marginBottom: 4,
                          }}
                        >
                          {c.theme}
                          <span style={{ color: '#A0A39A', fontSize: 11, marginLeft: 8 }}>
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
                      color: '#A0A39A',
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
                      <div style={{ fontSize: 12, color: '#F3F0E7', lineHeight: 1.45 }}>
                        {p.task_a.snippet || '—'}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#A0A39A',
                          fontStyle: 'italic',
                          margin: '4px 0',
                        }}
                      >
                        vs
                      </div>
                      <div style={{ fontSize: 12, color: '#F3F0E7', lineHeight: 1.45 }}>
                        {p.task_b.snippet || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!data.message &&
              data.perspective_clusters.length === 0 &&
              data.divergent_pairs.length === 0 ? (
                <div style={{ fontSize: 13, color: '#A0A39A', fontStyle: 'italic' }}>
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
