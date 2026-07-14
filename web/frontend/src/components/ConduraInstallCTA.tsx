import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConduraProbeState, HandoffPayload } from '../types/condura';
import { probeLocalCondura } from '../lib/conduraLocalProbe';
import { handoffClipboardUrl } from '../lib/conduraHandoff';
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
  message = 'Powered by Condura — free, local-first agent for on-device actions.',
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
      return;
    }
    // Focus the primary button on open so keyboard users can act immediately.
    firstBtnRef.current?.focus();
  }, [open]);

  // Escape-key closes the modal.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Basic focus trap: if tabbing past the last focusable button, cycle
  // back to the first (and Shift+Tab past the first goes to the last).
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
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [open]);

  if (!open) return null;

  const copyHandoff = async () => {
    if (!handoffPayload) return;
    const url = handoffClipboardUrl(handoffPayload);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const primaryLabel = (() => {
    if (mobile) return 'Save handoff — run on desktop';
    if (probe.kind === 'ready') return 'Send to Condura';
    if (probe.kind === 'installed_not_running') return 'Start Condura, then retry';
    if (probe.kind === 'not_installed') return 'Install Condura';
    return 'Detect Condura';
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(26,23,20,0.45)',
        display: 'flex',
        alignItems: mobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FAF7F4',
          borderRadius: mobile ? '20px 20px 0 0' : 16,
          maxWidth: 440,
          width: '100%',
          padding: 24,
          border: '0.5px solid #E0D8D0',
          boxShadow: '0 16px 40px rgba(26,23,20,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <img src={markUrl} alt="" width={22} height={22} />
          <h2 id={TITLE_ID} style={{ margin: 0, fontSize: 20, fontWeight: 500, color: '#2c1810' }}>{title}</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 15, color: '#6B6460', lineHeight: 1.6 }}>{message}</p>
        {mobile && (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8c7355' }}>
            Condura runs on macOS / Windows / Linux. Save this handoff and open it on your desktop.
          </p>
        )}
        {error && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#a94442' }}>{error}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            ref={firstBtnRef}
            className="arena-btn arena-btn--primary arena-btn--md arena-btn--full"
            disabled={busy || probing}
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
                  window.open(installUrl, '_blank', 'noopener,noreferrer');
                  return;
                }
                if (probe.kind === 'installed_not_running') {
                  window.open('condura://', '_blank');
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
            {probing ? 'Detecting…' : busy ? 'Working…' : primaryLabel}
          </button>
          {handoffPayload && (
            <button
              type="button"
              className="arena-btn arena-btn--secondary arena-btn--md arena-btn--full"
              onClick={() => void copyHandoff()}
            >
              {copied ? 'Copied handoff link' : 'Copy handoff'}
            </button>
          )}
          <button
            type="button"
            ref={lastBtnRef}
            className="arena-btn arena-btn--ghost arena-btn--md arena-btn--full"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {probe.kind === 'ready' && probe.version && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#a89070' }}>
            Condura {probe.version} detected
          </p>
        )}
      </div>
    </div>
  );
}

export default ConduraInstallCTA;
