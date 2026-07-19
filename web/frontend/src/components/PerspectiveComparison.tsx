import { useEffect, useMemo, useRef, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { AgentAnswerMarkdown } from './AgentAnswerMarkdown';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import {
  buildPerspectiveRows,
  formatPerspectiveComparisonMarkdown,
  sharedPerspectiveKeywords,
  type PerspectiveRowInput,
} from '../lib/perspectiveComparison';
import { motionDuration } from '../lib/motion';
import '../styles/perspective-comparison.css';

export type PerspectiveComparisonProps = {
  responses: PerspectiveRowInput[];
  question?: string;
  onClose: () => void;
};

function KeywordChips({
  words,
  muted,
}: {
  words: string[];
  muted?: boolean;
}) {
  if (words.length === 0) return null;
  return (
    <>
      {words.map((k) => (
        <span
          key={k}
          className={`pc-chip${muted ? ' pc-chip--muted' : ' pc-chip--accent'}`}
        >
          {k}
        </span>
      ))}
    </>
  );
}

/**
 * Modal: thematic differences across Arena minds (keywords + scores).
 */
export function PerspectiveComparison({ responses, question, onClose }: PerspectiveComparisonProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const downloadTimerRef = useRef<number | null>(null);

  const rows = useMemo(() => buildPerspectiveRows(responses), [responses]);
  const shared = useMemo(() => sharedPerspectiveKeywords(rows), [rows]);

  useEffect(() => {
    setExpandedAgentId(null);
  }, [responses]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusId = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(focusId);
      window.removeEventListener('keydown', onKey);
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
    };
  }, [onClose]);

  if (rows.length === 0) return null;

  const buildMarkdown = () => formatPerspectiveComparisonMarkdown({ question, rows });

  const copyMarkdown = async () => {
    const ok = await copyToClipboard(buildMarkdown());
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    setCopyStatus(ok ? 'copied' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    copyTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      copyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadMarkdown = () => {
    const stem = `perspective-comparison-${(question || 'arena').slice(0, 40)}`;
    const ok = downloadMarkdownFile(buildMarkdown(), stem);
    if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
    setDownloadStatus(ok ? 'done' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    downloadTimerRef.current = window.setTimeout(() => {
      setDownloadStatus('idle');
      downloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  return (
    <div role="presentation" className="pc-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="perspective-comparison-title"
        className="pc-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pc-header">
          <div className="pc-header__title-wrap">
            <span className="pc-header__mark" aria-hidden>
              <GitCompareArrows strokeWidth={1.75} />
            </span>
            <h2 id="perspective-comparison-title" className="pc-title">
              Perspective comparison
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="pc-close"
          >
            ×
          </button>
        </div>

        {question?.trim() ? (
          <p className="pc-question">{question.trim()}</p>
        ) : null}

        {shared.length > 0 ? (
          <div className="pc-shared">
            <div className="pc-shared__label">Shared across minds</div>
            <div>
              <KeywordChips words={shared} muted />
            </div>
          </div>
        ) : null}

        <div className="pc-rows">
          {rows.map((t) => {
            const isExpanded = expandedAgentId === t.agentId;
            const showFull = isExpanded && t.canExpand && Boolean(t.fullTake);
            return (
              <div
                key={t.agentId}
                className={[
                  'pc-row',
                  t.isWinner ? 'pc-row--winner' : '',
                  isExpanded ? 'pc-row--open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ ['--row-accent' as string]: t.color }}
              >
                <div className="pc-row__head">
                  <div
                    className="pc-row__dot"
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <span className="pc-row__name">{t.name}</span>
                  {t.isWinner ? (
                    <span className="pc-row__winner-badge">Winner</span>
                  ) : null}
                  <span className="pc-row__meta">
                    {[
                      t.scoreLabel ? `Score ${t.scoreLabel}` : null,
                      t.confidenceLabel ? `Conf. ${t.confidenceLabel}%` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                </div>
                {showFull ? (
                  <div className="pc-row__full">
                    <AgentAnswerMarkdown markdown={t.fullTake} question={question} />
                  </div>
                ) : t.oneLiner || t.fullTake ? (
                  <p className="pc-row__blurb">
                    “{t.oneLiner || t.fullTake}”
                  </p>
                ) : null}
                {t.canExpand ? (
                  <button
                    type="button"
                    className="pc-text-btn"
                    onClick={() =>
                      setExpandedAgentId((id) => (id === t.agentId ? null : t.agentId))
                    }
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Show less' : 'Show full take'}
                  </button>
                ) : null}
                <div className="pc-row__terms">
                  {t.distinctive.length > 0 ? (
                    <>
                      <div className="pc-row__terms-label">Distinctive</div>
                      <KeywordChips words={t.distinctive} />
                    </>
                  ) : t.keywords.length > 0 ? (
                    <KeywordChips words={t.keywords} muted />
                  ) : (
                    <span className="pc-row__empty-terms">No key terms</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pc-footer">
          <button
            type="button"
            onClick={() => void copyMarkdown()}
            className={`pc-ghost-btn${
              copyStatus === 'copied'
                ? ' pc-ghost-btn--ok'
                : copyStatus === 'failed'
                  ? ' pc-ghost-btn--err'
                  : ''
            }`}
          >
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy markdown'}
          </button>
          <button
            type="button"
            onClick={downloadMarkdown}
            className={`pc-ghost-btn${
              downloadStatus === 'done'
                ? ' pc-ghost-btn--ok'
                : downloadStatus === 'failed'
                  ? ' pc-ghost-btn--err'
                  : ''
            }`}
          >
            {downloadStatus === 'done'
              ? 'Downloaded'
              : downloadStatus === 'failed'
                ? 'Download failed'
                : 'Download .md'}
          </button>
          <button type="button" onClick={onClose} className="pc-done-btn">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
