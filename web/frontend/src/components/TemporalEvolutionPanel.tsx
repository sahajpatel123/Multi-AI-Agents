import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTemporalEvolution,
  type TemporalEvolutionResponse,
} from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration } from '../lib/motion';
import { formatTemporalEvolutionExport } from '../lib/temporalEvolutionExport';

function scoreColor(score: number): string {
  if (score >= 60) return '#D85A30';
  if (score >= 30) return '#C4956A';
  if (score >= 10) return '#8B7355';
  return '#6B8F71';
}

type Props = {
  taskId: string;
  /** Research question for export titles / context. */
  question?: string;
};

/** Collapsible panel: how related Agent research runs have shifted over time. */
export function TemporalEvolutionPanel({ taskId, question }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TemporalEvolutionResponse | null>(null);
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
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getTemporalEvolution(taskId);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load answer evolution');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  if (!taskId) return null;

  const evo = data?.evolution;
  const score = evo?.evolution_score;
  const accent = typeof score === 'number' ? scoreColor(score) : '#C4956A';
  const related = data?.related_count ?? evo?.related_count ?? 0;

  const buildMarkdown = () => {
    if (!evo) return '';
    return formatTemporalEvolutionExport({
      question,
      taskId,
      evolutionScore: evo.evolution_score,
      trendLabel: evo.trend_label,
      stability: evo.stability,
      relatedCount: related,
      message: evo.message,
      shifts: evo.key_shifts,
    });
  };

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
    const stem = `evolution-${(question || taskId || 'answer').slice(0, 40)}`;
    const ok = downloadMarkdownFile(md, stem);
    if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
    setDownloadStatus(ok ? 'done' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    downloadTimerRef.current = window.setTimeout(() => {
      setDownloadStatus('idle');
      downloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  return (
    <div
      style={{
        background: '#FAF7F2',
        border: '0.5px solid #E0D5C5',
        borderRadius: 12,
        overflow: 'hidden',
        margin: '0 0 20px',
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
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#C4956A',
          }}
        >
          Answer evolution
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {open && evo && typeof score === 'number' ? (
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
              {score}/100 · {evo.trend_label}
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
              Comparing related research runs…
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
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#A89070',
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          {evo && !error ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontFamily: 'Georgia, serif',
                    color: accent,
                    lineHeight: 1,
                  }}
                >
                  {evo.evolution_score}
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
                    {evo.trend_label}
                  </div>
                  <div style={{ fontSize: 12, color: '#A89070', marginTop: 2 }}>
                    Stability {evo.stability}/100
                    {related > 0 ? ` · ${related} related run${related === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy evolution analysis as markdown"
                    aria-label={
                      copyStatus === 'copied'
                        ? 'Evolution analysis copied'
                        : copyStatus === 'failed'
                          ? 'Copy failed'
                          : 'Copy evolution analysis as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #D4C4B0',
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
                            : '#C4956A',
                      cursor: 'pointer',
                    }}
                  >
                    {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    title="Download evolution analysis as markdown"
                    aria-label={
                      downloadStatus === 'done'
                        ? 'Evolution analysis downloaded'
                        : downloadStatus === 'failed'
                          ? 'Download failed'
                          : 'Download evolution analysis as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #D4C4B0',
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
                            : '#C4956A',
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
                    title="Refresh evolution analysis"
                    aria-label="Refresh evolution analysis"
                    style={{
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
              </div>

              {copyStatus !== 'idle' || downloadStatus !== 'idle' ? (
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
                    ? 'Evolution analysis copied to clipboard'
                    : copyStatus === 'failed'
                      ? 'Could not copy evolution analysis'
                      : downloadStatus === 'done'
                        ? 'Evolution analysis downloaded'
                        : downloadStatus === 'failed'
                          ? 'Could not download evolution analysis'
                          : ''}
                </div>
              ) : null}

              {evo.message ? (
                <div style={{ fontSize: 13, color: '#A89070', fontStyle: 'italic' }}>{evo.message}</div>
              ) : null}

              {evo.key_shifts.length > 0 ? (
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
                    Key shifts between runs
                  </div>
                  {evo.key_shifts.map((s, i) => (
                    <div
                      key={`${s.from_task}-${s.to_task}-${i}`}
                      style={{
                        background: '#FDF5F0',
                        borderLeft: '3px solid #D85A30',
                        borderRadius: 6,
                        padding: '10px 12px',
                        marginBottom: 8,
                      }}
                    >
                      {s.gained_terms.length > 0 ? (
                        <div style={{ fontSize: 12, color: '#2C1810', marginBottom: 4 }}>
                          <span style={{ color: '#6B8F71', fontSize: 10, textTransform: 'uppercase' }}>
                            Gained{' '}
                          </span>
                          {s.gained_terms.join(' · ')}
                        </div>
                      ) : null}
                      {s.lost_terms.length > 0 ? (
                        <div style={{ fontSize: 12, color: '#2C1810' }}>
                          <span style={{ color: '#D85A30', fontSize: 10, textTransform: 'uppercase' }}>
                            Faded{' '}
                          </span>
                          {s.lost_terms.join(' · ')}
                        </div>
                      ) : null}
                      {s.gained_terms.length === 0 && s.lost_terms.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#A89070', fontStyle: 'italic' }}>
                          No term-level shift recorded
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : !evo.message ? (
                <div style={{ fontSize: 13, color: '#A89070', fontStyle: 'italic' }}>
                  Related runs stay close in vocabulary — little drift detected yet.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
