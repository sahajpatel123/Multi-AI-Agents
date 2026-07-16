import { useEffect, useMemo, useRef, useState } from 'react';
import { copyToClipboard } from '../lib/clipboard';
import {
  buildPerspectiveRows,
  formatPerspectiveComparisonMarkdown,
  sharedPerspectiveKeywords,
  type PerspectiveRowInput,
} from '../lib/perspectiveComparison';
import { motionDuration } from '../lib/motion';

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
          style={{
            display: 'inline-block',
            background: muted ? '#F5F0E8' : 'rgba(196,149,106,0.14)',
            border: muted ? '0.5px solid transparent' : '0.5px solid rgba(196,149,106,0.35)',
            borderRadius: 4,
            padding: '2px 6px',
            marginRight: 4,
            marginBottom: 4,
            fontSize: 11,
            color: muted ? '#8A7355' : '#6B4E32',
          }}
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
  const copyTimerRef = useRef<number | null>(null);

  const rows = useMemo(() => buildPerspectiveRows(responses), [responses]);
  const shared = useMemo(() => sharedPerspectiveKeywords(rows), [rows]);

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
    };
  }, [onClose]);

  if (rows.length === 0) return null;

  const copyMarkdown = async () => {
    const md = formatPerspectiveComparisonMarkdown({ question, rows });
    const ok = await copyToClipboard(md);
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    setCopyStatus(ok ? 'copied' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    copyTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      copyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 23, 20, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="perspective-comparison-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FAF7F2',
          borderRadius: 14,
          padding: 24,
          width: 'min(560px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 24px 48px rgba(26, 23, 20, 0.15)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <h2
            id="perspective-comparison-title"
            style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#1A1714', fontFamily: 'Georgia, serif' }}
          >
            Perspective comparison
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              color: '#A89070',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {question?.trim() ? (
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 12,
              color: '#8C7355',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            {question.trim()}
          </p>
        ) : null}

        {shared.length > 0 ? (
          <div
            style={{
              background: '#F5F0E8',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#A89070',
                marginBottom: 6,
              }}
            >
              Shared across minds
            </div>
            <div>
              <KeywordChips words={shared} muted />
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((t) => (
            <div
              key={t.agentId}
              style={{
                background: '#FFFFFF',
                border: t.isWinner ? '0.5px solid rgba(196,149,106,0.55)' : '0.5px solid #E0D8D0',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: t.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#2C1810' }}>{t.name}</span>
                {t.isWinner ? (
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#C4956A',
                    }}
                  >
                    Winner
                  </span>
                ) : null}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#A89070' }}>
                  {[
                    t.scoreLabel ? `Score ${t.scoreLabel}` : null,
                    t.confidenceLabel ? `Conf. ${t.confidenceLabel}%` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
              {t.oneLiner ? (
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 13,
                    color: '#4A3728',
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                  }}
                >
                  “{t.oneLiner}”
                </p>
              ) : null}
              <div style={{ fontSize: 12, color: '#4A3728' }}>
                {t.distinctive.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#A89070',
                        marginBottom: 4,
                      }}
                    >
                      Distinctive
                    </div>
                    <KeywordChips words={t.distinctive} />
                  </>
                ) : t.keywords.length > 0 ? (
                  <KeywordChips words={t.keywords} muted />
                ) : (
                  <span style={{ color: '#A89070', fontStyle: 'italic' }}>No key terms</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => void copyMarkdown()}
            style={{
              background: 'none',
              border: '0.5px solid #E0D8D0',
              borderRadius: 999,
              padding: '7px 14px',
              fontSize: 12,
              color:
                copyStatus === 'failed' ? '#D85A30' : copyStatus === 'copied' ? '#5A8C6A' : '#6B6460',
              cursor: 'pointer',
              fontFamily: 'Georgia, serif',
            }}
          >
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy markdown'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1A1714',
              border: 'none',
              borderRadius: 999,
              padding: '7px 16px',
              fontSize: 12,
              color: '#FAF7F4',
              cursor: 'pointer',
              fontFamily: 'Georgia, serif',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
