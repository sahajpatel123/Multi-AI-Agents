import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConduraProbeState, HandoffPayload } from '../types/condura';
import { probeLocalCondura } from '../lib/conduraLocalProbe';
import { handoffClipboardUrl } from '../lib/conduraHandoff';
import { copyToClipboard } from '../lib/clipboard';
import { conduraPrimaryLabel, resolveInstallUrl } from '../lib/conduraCta';
import { motionDuration } from '../lib/motion';
import { MotionButton } from './MotionButton';
import {
  deleteConduraHandoffDraft,
  listConduraHandoffDrafts,
  type ConduraHandoffDraftSummary,
} from '../api';
import markUrl from '../assets/condura/mark.svg';

const TITLE_ID = 'condura-cta-title';

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

// Same relative-time idiom as SessionCard and DiscussHistoryDrawer.
function formatDraftTime(timestamp: string | null): string {
  if (!timestamp) return '';
  const then = new Date(timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function draftLabel(draft: ConduraHandoffDraftSummary): string {
  const intent = (draft.payload as { intent?: { summary?: unknown } } | null)?.intent;
  const summary = typeof intent?.summary === 'string' ? intent.summary.trim() : '';
  return summary || draft.capability || 'Saved handoff';
}

/**
 * Handoff signatures are only valid for 24 h after issuance, so a saved
 * draft can outlive its own usefulness. Returns the payload's expiry
 * stamp when present and parseable.
 */
function draftExpiry(draft: ConduraHandoffDraftSummary): Date | null {
  const auth = (draft.payload as { auth?: { expires_at?: unknown } } | null)?.auth;
  const raw = typeof auth?.expires_at === 'string' ? auth.expires_at : '';
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function ConduraInstallCTA({
  open,
  onClose,
  title = 'This needs your machine',
  message = 'Arena cannot control your computer from the browser. Install Condura (free, local-first) for on-device actions.',
  installUrl = 'https://condura.app',
  handoffPayload,
  onSendToCondura,
  onSaveDraft,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  installUrl?: string;
  handoffPayload?: HandoffPayload | null;
  onSendToCondura?: () => Promise<void> | void;
  onSaveDraft?: () => Promise<void> | void;
}) {
  const [probe, setProbe] = useState<ConduraProbeState>({ kind: 'unknown' });
  const [probing, setProbing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Saved-handoff drafts: fetched when the dialog opens so a handoff
  // saved earlier (e.g. on this phone) can be re-copied or deleted.
  const [drafts, setDrafts] = useState<ConduraHandoffDraftSummary[] | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [busyDraftId, setBusyDraftId] = useState<number | null>(null);
  const [copiedDraftId, setCopiedDraftId] = useState<number | null>(null);
  const copiedDraftTimerRef = useRef<number | null>(null);
  const mobile = isMobileUa();
  const firstBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastBtnRef = useRef<HTMLButtonElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const safeInstallUrl = resolveInstallUrl(installUrl);

  const clearCopyTimer = () => {
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  };

  const runProbe = useCallback(async () => {
    setProbing(true);
    setError(null);
    try {
      const state = await probeLocalCondura();
      setProbe(state);
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setProbe({ kind: 'unknown' });
      setError(null);
      setCopied(false);
      setDrafts(null);
      setDraftsError(null);
      setConfirmingDeleteId(null);
      setBusyDraftId(null);
      setCopiedDraftId(null);
      clearCopyTimer();
      return;
    }
    firstBtnRef.current?.focus();
  }, [open]);

  // Drafts refetch on every open — a draft saved on another device since
  // the last open must be waiting here.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDraftsError(null);
    listConduraHandoffDrafts({ perPage: 20 })
      .then((result) => {
        if (!cancelled) setDrafts(result.drafts);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDrafts([]);
        setDraftsError(
          e instanceof Error && e.message ? e.message : 'Could not load saved handoffs.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const first = firstBtnRef.current;
      const last = lastBtnRef.current;
      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => () => clearCopyTimer(), []);
  useEffect(
    () => () => {
      if (copiedDraftTimerRef.current != null) {
        window.clearTimeout(copiedDraftTimerRef.current);
      }
    },
    [],
  );

  if (!open) return null;

  const copyHandoff = async () => {
    if (!handoffPayload) return;
    const url = handoffClipboardUrl(handoffPayload);
    const ok = await copyToClipboard(url);
    if (!ok) {
      setError('Could not copy handoff link — long-press to select and copy.');
      setCopied(false);
      return;
    }
    setError(null);
    setCopied(true);
    clearCopyTimer();
    const resetMs = motionDuration(2000);
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, resetMs > 0 ? resetMs : 0);
  };

  // A saved draft holds the full handoff payload, so its link can be
  // rebuilt anywhere — that is the entire point of saving one.
  const copySavedDraft = async (draft: ConduraHandoffDraftSummary) => {
    if (!draft.payload) {
      setDraftsError("This saved handoff's payload is damaged — delete it and start a fresh handoff.");
      return;
    }
    try {
      const url = handoffClipboardUrl(draft.payload as unknown as HandoffPayload);
      const ok = await copyToClipboard(url);
      if (!ok) throw new Error('copy failed');
      setDraftsError(null);
      setCopiedDraftId(draft.id);
      if (copiedDraftTimerRef.current != null) window.clearTimeout(copiedDraftTimerRef.current);
      const resetMs = motionDuration(2000);
      copiedDraftTimerRef.current = window.setTimeout(() => {
        setCopiedDraftId(null);
        copiedDraftTimerRef.current = null;
      }, resetMs > 0 ? resetMs : 0);
    } catch {
      setDraftsError('Could not copy that saved handoff link.');
    }
  };

  // Deletion is permanent server-side, so the first click only arms an
  // inline confirm — the row says so before anything is sent.
  const requestDraftDelete = (draft: ConduraHandoffDraftSummary) => {
    setDraftsError(null);
    setConfirmingDeleteId(draft.id);
  };

  const cancelDraftDelete = () => setConfirmingDeleteId(null);

  const confirmDraftDelete = async (draft: ConduraHandoffDraftSummary) => {
    setConfirmingDeleteId(null);
    setBusyDraftId(draft.id);
    try {
      await deleteConduraHandoffDraft(draft.id);
      // The row leaves the list only after the server accepts.
      setDrafts((current) =>
        current ? current.filter((item) => item.id !== draft.id) : current,
      );
    } catch (e) {
      setDraftsError(
        e instanceof Error && e.message ? e.message : 'Could not delete that saved handoff.',
      );
    } finally {
      setBusyDraftId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className={`condura-cta-overlay${mobile ? ' condura-cta-overlay--mobile' : ''}`}
      onClick={onClose}
    >
      <div
        className={`condura-cta-panel${mobile ? ' condura-cta-panel--mobile' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {mobile ? <div className="condura-cta__grabber" aria-hidden /> : null}

        <div className="condura-cta__header">
          <span className="condura-cta__mark" aria-hidden>
            <img src={markUrl} alt="" width={20} height={20} />
          </span>
          <h2 id={TITLE_ID} className="condura-cta__title">
            {title}
          </h2>
        </div>

        <p className="condura-cta__message">{message}</p>
        <p className="condura-cta__honesty">
          No browser shims, cloud desktops, or fake local control — if Condura is not installed,
          this step stays pending.
        </p>
        {mobile ? (
          <p className="condura-cta__mobile-note">
            Condura runs on macOS / Windows / Linux. Save this handoff and open it on your desktop.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="condura-cta__error">
            {error}
          </p>
        ) : null}

        <div className="condura-cta__actions">
          <MotionButton
            type="button"
            ref={firstBtnRef}
            variant="primary"
            size="md"
            fullWidth
            disabled={busy || probing}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                if (mobile) {
                  await onSaveDraft?.();
                  await copyHandoff();
                  return;
                }
                if (probe.kind === 'unknown') {
                  await runProbe();
                  return;
                }
                if (probe.kind === 'not_installed') {
                  window.open(safeInstallUrl, '_blank', 'noopener,noreferrer');
                  return;
                }
                if (probe.kind === 'installed_not_running') {
                  window.open('condura://', '_blank', 'noopener,noreferrer');
                  await runProbe();
                  return;
                }
                await onSendToCondura?.();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Something went wrong');
              } finally {
                setBusy(false);
              }
            }}
          >
            {conduraPrimaryLabel({ mobile, probe, probing, busy })}
          </MotionButton>
          {handoffPayload ? (
            <button
              type="button"
              className="arena-btn arena-btn--secondary arena-btn--md arena-btn--full"
              onClick={() => void copyHandoff()}
            >
              {copied ? 'Copied handoff link' : 'Copy handoff'}
            </button>
          ) : null}
          <button
            type="button"
            ref={lastBtnRef}
            className="arena-btn arena-btn--ghost arena-btn--md arena-btn--full"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {drafts !== null && (drafts.length > 0 || draftsError) ? (
          <section
            aria-label="Saved handoffs"
            style={{ marginTop: 14, borderTop: '0.5px solid rgba(140,115,85,0.25)', paddingTop: 10 }}
          >
            <h3
              style={{
                margin: '0 0 6px',
                fontSize: 12,
                fontWeight: 600,
                color: '#8C7355',
                fontFamily: 'var(--vp-font-sans)',
              }}
            >
              Saved handoffs ({drafts.length})
            </h3>
            {draftsError ? (
              <p role="alert" style={{ margin: '0 0 6px', fontSize: 12, color: '#993C1D' }}>
                {draftsError}
              </p>
            ) : null}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {drafts.map((draft) => {
                const busy = busyDraftId === draft.id;
                const expiry = draftExpiry(draft);
                const isExpired = expiry !== null && expiry.getTime() < Date.now();
                return (
                  <li
                    key={draft.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#4A3728', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {draftLabel(draft)}
                      <span style={{ display: 'block', fontSize: 10, color: '#A0A39A' }}>
                        {draft.capability || 'unknown capability'}
                        {draft.createdAt ? ` · ${formatDraftTime(draft.createdAt)}` : ''}
                        {isExpired ? (
                          <span style={{ color: '#993C1D' }}> · signature expired</span>
                        ) : null}
                      </span>
                    </span>
                    {confirmingDeleteId === draft.id ? (
                      <>
                        <span style={{ fontSize: 10, color: '#993C1D' }}>Delete forever?</span>
                        <button
                          type="button"
                          disabled={busyDraftId !== null}
                          aria-label={`Confirm deleting saved handoff ${draftLabel(draft)}`}
                          onClick={() => void confirmDraftDelete(draft)}
                          style={{
                            background: 'none',
                            border: '0.5px solid #D85A30',
                            borderRadius: 6,
                            padding: '2px 7px',
                            fontSize: 10,
                            color: busy ? '#A0A39A' : '#993C1D',
                            cursor: busyDraftId !== null ? 'wait' : 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          {busy ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={busyDraftId !== null}
                          aria-label={`Keep saved handoff ${draftLabel(draft)}`}
                          onClick={cancelDraftDelete}
                          style={{
                            background: 'none',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 6,
                            padding: '2px 7px',
                            fontSize: 10,
                            color: '#4A3728',
                            cursor: busyDraftId !== null ? 'wait' : 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Copy link for saved handoff ${draftLabel(draft)}`}
                          title={
                            isExpired
                              ? 'This handoff was signed with a 24-hour window that has since passed — consider starting a fresh handoff'
                              : undefined
                          }
                          onClick={() => void copySavedDraft(draft)}
                          style={{
                            background: 'none',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 6,
                            padding: '2px 7px',
                            fontSize: 10,
                            color:
                              copiedDraftId === draft.id
                                ? '#5A8C6A'
                                : isExpired
                                  ? '#A0A39A'
                                  : '#4A3728',
                            cursor: 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          {copiedDraftId === draft.id ? 'Copied' : 'Copy link'}
                        </button>
                        <button
                          type="button"
                          disabled={busyDraftId !== null}
                          aria-label={`Delete saved handoff ${draftLabel(draft)}`}
                          onClick={() => requestDraftDelete(draft)}
                          style={{
                            background: 'none',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 6,
                            padding: '2px 7px',
                            fontSize: 10,
                            color: '#D85A30',
                            cursor: busyDraftId !== null ? 'wait' : 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {probe.kind === 'ready' && probe.version ? (
          <p className="condura-cta__status" role="status">
            Condura {probe.version} detected
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default ConduraInstallCTA;
