import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  exportScoringAuditCsv,
  exportScoringAuditJson,
  exportScoringAuditMarkdown,
  fetchScoringAudit,
} from '../api';
import { downloadBlobFile, sanitizeDownloadFilename } from '../lib/downloadTextFile';
import { copyMarkdownToClipboard } from '../lib/clipboard';
import {
  AGENTS,
  type ScoringAuditConfidence,
  type ScoringAuditResponse,
  type ScoringAuditRound,
} from '../types';
import MicroLoader from './MicroLoader';
import '../styles/scoring-audit-modal.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ScoringAuditModalProps {
  sessionId: string;
  onClose: () => void;
  /** Resolves persona ids (e.g. "analyst") to display names from the user's panel. */
  personaNameResolver?: (personaId: string) => string | undefined;
}

type ScoringAuditExportFormat = 'csv' | 'json' | 'md';
type MarkdownCopyStatus = 'copying' | 'copied';

function agentDisplayName(agentId: string): string {
  const normalized = agentId.replace(/-/g, '_');
  return AGENTS[normalized]?.name || AGENTS[agentId]?.name || agentId;
}

function formatAuditTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ScoringAuditModal({
  sessionId,
  onClose,
  personaNameResolver,
}: ScoringAuditModalProps) {
  const [data, setData] = useState<ScoringAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [exporting, setExporting] = useState<ScoringAuditExportFormat | null>(null);
  const [copyingMarkdown, setCopyingMarkdown] = useState(false);
  const [copyStatus, setCopyStatus] = useState<MarkdownCopyStatus | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const copyRunRef = useRef(0);
  const titleId = useId();

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setData(null);
    setCopyingMarkdown(false);
    setCopyStatus(null);
    setExportError(null);
    copyRunRef.current += 1;

    void fetchScoringAudit(sessionId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load scoring audit.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      copyRunRef.current += 1;
    };
  }, [sessionId, retryKey]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep Tab focus inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => {
        if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const nameFor = useCallback(
    (id: string) => personaNameResolver?.(id) || agentDisplayName(id),
    [personaNameResolver],
  );

  const handleExport = useCallback(async (format: ScoringAuditExportFormat) => {
    if (!data || exporting || copyingMarkdown) return;
    setExporting(format);
    setCopyStatus(null);
    setExportError(null);
    try {
      const blob = format === 'json'
        ? await exportScoringAuditJson(sessionId, data.audit_count)
        : format === 'md'
          ? await exportScoringAuditMarkdown(sessionId, data.audit_count)
          : await exportScoringAuditCsv(sessionId, data.audit_count);
      const accepted = downloadBlobFile(
        blob,
        `arena-scoring-audit-${sanitizeDownloadFilename(sessionId, 'session')}.${format}`,
      );
      if (!accepted) {
        setExportError(
          'Your browser blocked the download. Check your download settings and try again.',
        );
      }
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : `Could not export the scoring audit as ${format === 'md' ? 'Markdown' : format.toUpperCase()}.`,
      );
    } finally {
      setExporting(null);
    }
  }, [copyingMarkdown, data, exporting, sessionId]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!data || data.audits.length === 0 || exporting || copyingMarkdown) return;
    const runId = ++copyRunRef.current;
    setCopyingMarkdown(true);
    setCopyStatus('copying');
    setExportError(null);
    try {
      const blob = await exportScoringAuditMarkdown(sessionId, data.audit_count);
      if (copyRunRef.current !== runId) return;
      const copied = await copyMarkdownToClipboard(await blob.text());
      if (copyRunRef.current !== runId) return;
      if (copied) {
        setCopyStatus('copied');
      } else {
        setCopyStatus(null);
        setExportError('Could not copy the scoring audit Markdown — try again.');
      }
    } catch (err) {
      if (copyRunRef.current !== runId) return;
      setCopyStatus(null);
      setExportError(
        err instanceof Error
          ? err.message
          : 'Could not copy the scoring audit Markdown — try again.',
      );
    } finally {
      if (copyRunRef.current === runId) setCopyingMarkdown(false);
    }
  }, [copyingMarkdown, data, exporting, sessionId]);

  return (
    <div
      className="sa-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="sa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={loading}
      >
        <header className="sa-header">
          <div className="sa-header__copy">
            <h2 id={titleId}>Scoring audit</h2>
            <p>How the judge scored each mind, per round.</p>
          </div>
          <button
            type="button"
            className="sa-export"
            onClick={() => void handleExport('csv')}
            disabled={!data || data.audits.length === 0 || exporting !== null || copyingMarkdown}
            aria-busy={exporting === 'csv' || undefined}
            aria-label="Export scoring audit as CSV"
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            className="sa-export"
            onClick={() => void handleExport('json')}
            disabled={!data || data.audits.length === 0 || exporting !== null || copyingMarkdown}
            aria-busy={exporting === 'json' || undefined}
            aria-label="Export scoring audit as JSON"
          >
            {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
          <button
            type="button"
            className="sa-export"
            onClick={() => void handleExport('md')}
            disabled={!data || data.audits.length === 0 || exporting !== null || copyingMarkdown}
            aria-busy={exporting === 'md' || undefined}
            aria-label="Export scoring audit as Markdown"
          >
            {exporting === 'md' ? 'Exporting…' : 'Export Markdown'}
          </button>
          <button
            type="button"
            className="sa-export sa-copy"
            onClick={() => void handleCopyMarkdown()}
            disabled={!data || data.audits.length === 0 || exporting !== null || copyingMarkdown}
            aria-busy={copyingMarkdown || undefined}
            aria-label={
              copyStatus === 'copied' ? 'Markdown copied' : 'Copy scoring audit as Markdown'
            }
          >
            {copyStatus === 'copying'
              ? 'Copying…'
              : copyStatus === 'copied'
                ? 'Copied Markdown'
                : 'Copy Markdown'}
          </button>
          <button
            ref={closeRef}
            type="button"
            className="sa-close"
            onClick={onClose}
            aria-label="Close scoring audit"
          >
            ×
          </button>
        </header>

        <div className="sa-body">
          {exportError ? (
            <p className="sa-export-error" role="alert">
              {exportError}
            </p>
          ) : null}
          {copyStatus ? (
            <p className="sa-copy-notice" role="status" aria-live="polite">
              {copyStatus === 'copying'
                ? 'Copying Markdown to the clipboard.'
                : 'Markdown copied to the clipboard.'}
            </p>
          ) : null}
          {loading ? (
            <div className="sa-center">
              <MicroLoader />
              <p>Loading scoring audit…</p>
            </div>
          ) : error ? (
            <div className="sa-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="sa-retry"
                onClick={() => setRetryKey((key) => key + 1)}
              >
                Retry
              </button>
            </div>
          ) : notFound ? (
            <div className="sa-center">
              <p>No scoring audits recorded for this session.</p>
              <p className="sa-center__hint">
                Rounds created before scoring audits were introduced won't have per-round data.
              </p>
            </div>
          ) : data && data.audits.length === 0 ? (
            <div className="sa-center">
              <p>No scoring audits found for this session.</p>
            </div>
          ) : data ? (
            <>
              <p className="sa-count">
                {data.total_count} {data.total_count === 1 ? 'round' : 'rounds'}
                {data.audit_count !== data.total_count
                  ? ` · showing the newest ${data.audit_count}`
                  : ''}
              </p>
              <ol className="sa-rounds">
                {data.audits.map((round) => (
                  <ScoringAuditRoundCard key={round.id} round={round} nameFor={nameFor} />
                ))}
              </ol>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScoringAuditRoundCard({
  round,
  nameFor,
}: {
  round: ScoringAuditRound;
  nameFor: (id: string) => string;
}) {
  const scores = useMemo(
    () =>
      Object.entries(round.scores || {})
        .map(([agentId, score]) => ({ agentId, score }))
        .sort((a, b) => b.score - a.score),
    [round.scores],
  );
  const maxScore = Math.max(100, ...scores.map((entry) => entry.score));
  const winnerId = round.winner_agent_id || round.winner_persona_id || '';
  const winnerName = winnerId ? nameFor(winnerId) : 'Unknown';

  return (
    <li className="sa-round">
      <div className="sa-round__head">
        <span className="sa-round__time">{formatAuditTime(round.created_at)}</span>
        {round.fallback_used ? (
          <span
            className="sa-round__fallback"
            title="The judge model failed, so fallback scores were used"
          >
            Judge fallback
          </span>
        ) : null}
      </div>
      <p className="sa-round__prompt">{round.prompt_snippet || '(no prompt captured)'}</p>
      <div className="sa-round__winner">
        Winner <strong>{winnerName}</strong>
        {round.winner_score != null ? (
          <span className="sa-round__winner-score">{round.winner_score}</span>
        ) : null}
      </div>
      {scores.length > 0 ? (
        <ul className="sa-scores" aria-label="Per-mind scores">
          {scores.map(({ agentId, score }) => (
            <li
              key={agentId}
              className={
                agentId === round.winner_agent_id ? 'sa-score sa-score--winner' : 'sa-score'
              }
            >
              <span className="sa-score__name">{nameFor(agentId)}</span>
              <span className="sa-score__track">
                <span
                  className="sa-score__fill"
                  style={{ width: `${Math.round((score / maxScore) * 100)}%` }}
                />
              </span>
              <span className="sa-score__value">{score}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {round.criteria_breakdown ? (
        <details className="sa-criteria">
          <summary>Criteria breakdown</summary>
          <div className="sa-criteria__grid">
            {Object.entries(round.criteria_breakdown).map(([agentId, criteria]) => (
              <div key={agentId} className="sa-criteria__cell">
                <strong>{nameFor(agentId)}</strong>
                {Object.entries(criteria).map(([key, value]) => (
                  <span key={key}>
                    {key.replace(/_/g, ' ')}: {value}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {round.confidence_values && round.confidence_values.length > 0 ? (
        <ConfidenceLine values={round.confidence_values} nameFor={nameFor} />
      ) : null}
      {round.scoring_duration_ms != null ? (
        <p className="sa-duration">Scored in {round.scoring_duration_ms} ms</p>
      ) : null}
    </li>
  );
}

function ConfidenceLine({
  values,
  nameFor,
}: {
  values: ScoringAuditConfidence[];
  nameFor: (id: string) => string;
}) {
  return (
    <p className="sa-confidence">
      Confidence:{' '}
      {values.map((entry, index) => (
        <span key={entry.agent_id}>
          {index > 0 ? ' · ' : null}
          {nameFor(entry.agent_id)} {entry.confidence}%
        </span>
      ))}
    </p>
  );
}
