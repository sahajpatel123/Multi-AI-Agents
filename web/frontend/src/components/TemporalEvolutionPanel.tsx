import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTemporalEvolution,
  type TemporalEvolutionResponse,
} from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration } from '../lib/motion';
import { formatTemporalEvolutionExport } from '../lib/temporalEvolutionExport';
import '../styles/temporal-evolution.css';

function formatRunDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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
  const navigate = useNavigate();
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
  const timeline = evo?.timeline ?? [];

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
      timeline: timeline.map((item) => ({
        ...item,
        isCurrent: item.task_id === taskId,
      })),
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
      className="te-panel"
      style={{ ['--te-accent' as string]: accent }}
    >
      <button
        type="button"
        className="te-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="te-header__label">
          <span className="te-header__dot" aria-hidden />
          Answer evolution
        </span>
        <div className="te-header__right">
          {open && evo && typeof score === 'number' ? (
            <span
              className="te-header__badge"
              style={{ color: accent, borderColor: accent }}
            >
              {score}/100 · {evo.trend_label}
            </span>
          ) : null}
          <span
            className={`te-header__chevron${open ? ' te-header__chevron--open' : ''}`}
            aria-hidden
          >
            {open ? '▾' : '▸'}
          </span>
        </div>
      </button>

      {open ? (
        <div className="te-body">
          {loading && !data ? (
            <div className="te-loading">
              <span className="te-loading__dot" aria-hidden />
              <span className="te-loading__dot" aria-hidden />
              <span className="te-loading__dot" aria-hidden />
              Comparing related research runs…
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="te-error">
              <span className="te-error__msg">{error}</span>
              <button
                type="button"
                className="te-error__retry"
                onClick={() => void load()}
              >
                Retry
              </button>
              <button
                type="button"
                className="te-error__dismiss"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
              >
                ×
              </button>
            </div>
          ) : null}

          {evo && !error ? (
            <>
              <div className="te-score-row">
                <div className="te-score" style={{ color: accent }}>
                  {evo.evolution_score}
                </div>
                <div className="te-score-meta">
                  <div className="te-score-meta__trend">{evo.trend_label}</div>
                  <div className="te-score-meta__sub">
                    Stability {evo.stability}/100
                    {related > 0 ? ` · ${related} related run${related === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div className="te-actions">
                  <button
                    type="button"
                    className={`te-ghost-btn${
                      copyStatus === 'copied'
                        ? ' te-ghost-btn--ok'
                        : copyStatus === 'failed'
                          ? ' te-ghost-btn--err'
                          : ''
                    }`}
                    onClick={handleCopy}
                    title="Copy evolution analysis as markdown"
                    aria-label={
                      copyStatus === 'copied'
                        ? 'Evolution analysis copied'
                        : copyStatus === 'failed'
                          ? 'Copy failed'
                          : 'Copy evolution analysis as markdown'
                    }
                  >
                    {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className={`te-ghost-btn${
                      downloadStatus === 'done'
                        ? ' te-ghost-btn--ok'
                        : downloadStatus === 'failed'
                          ? ' te-ghost-btn--err'
                          : ''
                    }`}
                    onClick={handleDownload}
                    title="Download evolution analysis as markdown"
                    aria-label={
                      downloadStatus === 'done'
                        ? 'Evolution analysis downloaded'
                        : downloadStatus === 'failed'
                          ? 'Download failed'
                          : 'Download evolution analysis as markdown'
                    }
                  >
                    {downloadStatus === 'done'
                      ? 'Downloaded'
                      : downloadStatus === 'failed'
                        ? 'Failed'
                        : 'Download .md'}
                  </button>
                  <button
                    type="button"
                    className="te-ghost-btn"
                    onClick={() => void load()}
                    disabled={loading}
                    title="Refresh evolution analysis"
                    aria-label="Refresh evolution analysis"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {copyStatus !== 'idle' || downloadStatus !== 'idle' ? (
                <div role="status" aria-live="polite" className="te-sr-only">
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
                <div className="te-message">{evo.message}</div>
              ) : null}

              {timeline.length > 0 ? (
                <div className="te-section">
                  <div className="te-section__label">Related runs</div>
                  <div className="te-timeline">
                    {timeline.map((item, i) => {
                      const isCurrent = item.task_id === taskId;
                      const when = formatRunDate(item.created_at);
                      const snippet = (item.snippet || '').trim();
                      const runScore =
                        typeof item.score === 'number' && Number.isFinite(item.score)
                          ? Math.round(item.score)
                          : null;
                      return (
                        <button
                          key={item.task_id || `run-${i}`}
                          type="button"
                          className={`te-run${isCurrent ? ' te-run--current' : ''}`}
                          onClick={() => {
                            if (!item.task_id || isCurrent) return;
                            navigate(`/agent?task_id=${encodeURIComponent(item.task_id)}`);
                          }}
                          disabled={!item.task_id}
                          title={
                            isCurrent
                              ? 'Current research run'
                              : item.task_id
                                ? 'Open this research run'
                                : undefined
                          }
                        >
                          <div
                            className={`te-run__head${snippet ? ' te-run__head--has-snippet' : ''}`}
                          >
                            <span className="te-run__when">
                              {when || `Run ${i + 1}`}
                              {isCurrent ? ' · current' : ''}
                            </span>
                            {runScore != null ? (
                              <span className="te-run__score">{runScore}/100</span>
                            ) : null}
                          </div>
                          {snippet ? (
                            <div className="te-run__snippet">{snippet}</div>
                          ) : (
                            <div className="te-run__empty">No answer snippet available</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {evo.key_shifts.length > 0 ? (
                <div className="te-section">
                  <div className="te-section__label">Key shifts between runs</div>
                  {evo.key_shifts.map((s, i) => (
                    <div key={`${s.from_task}-${s.to_task}-${i}`} className="te-shift">
                      {s.gained_terms.length > 0 ? (
                        <div className="te-shift__gained">
                          <span className="te-shift__tag te-shift__tag--gain">Gained </span>
                          {s.gained_terms.join(' · ')}
                        </div>
                      ) : null}
                      {s.lost_terms.length > 0 ? (
                        <div className="te-shift__lost">
                          <span className="te-shift__tag te-shift__tag--fade">Faded </span>
                          {s.lost_terms.join(' · ')}
                        </div>
                      ) : null}
                      {s.gained_terms.length === 0 && s.lost_terms.length === 0 ? (
                        <div className="te-shift__empty">No term-level shift recorded</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : !evo.message && timeline.length === 0 ? (
                <div className="te-quiet">
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
