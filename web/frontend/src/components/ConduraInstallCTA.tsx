import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConduraProbeState, HandoffPayload } from '../types/condura';
import { probeLocalCondura } from '../lib/conduraLocalProbe';
import { handoffClipboardUrl } from '../lib/conduraHandoff';
import { copyToClipboard } from '../lib/clipboard';
import { conduraPrimaryLabel, resolveInstallUrl } from '../lib/conduraCta';
import { motionDuration } from '../lib/motion';
import { MotionButton } from './MotionButton';
import markUrl from '../assets/condura/mark.svg';

const TITLE_ID = 'condura-cta-title';

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
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
      clearCopyTimer();
      return;
    }
    firstBtnRef.current?.focus();
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
