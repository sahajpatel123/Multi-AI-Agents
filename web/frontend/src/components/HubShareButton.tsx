import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Link2, X } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';

export interface HubShareButtonProps {
  /** Label for the button when idle. */
  label?: string;
  /** Override the URL to copy; defaults to window.location.href at click time. */
  url?: string;
  /** Optional className for the button. */
  className?: string;
}

type Status = 'idle' | 'copied' | 'error';

/**
 * "Copy link to this view" button. Captures the current URL (or an
 * override) and writes it to the clipboard via the safe
 * `copyToClipboard` helper. Shows a transient "Copied" / "Failed"
 * badge for ~1.6s before reverting to the idle label.
 *
 * Designed to live next to the hub filter chips so users can share
 * their current search / category / mood state without leaving the
 * page.
 */
export function HubShareButton({
  label = 'Copy link to this view',
  url,
  className = 'ppg-share-btn',
}: HubShareButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onClick = useCallback(async () => {
    const target = url ?? (typeof window !== 'undefined' ? window.location.href : '');
    if (!target) {
      setStatus('error');
    } else {
      const ok = await copyToClipboard(target);
      setStatus(ok ? 'copied' : 'error');
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus('idle'), 1600);
  }, [url]);

  const isCopied = status === 'copied';
  const isError = status === 'error';

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-live="polite"
      aria-label={isCopied ? 'Link copied to clipboard' : label}
    >
      <span className="ppg-share-btn__icon" aria-hidden>
        {isCopied ? <Check width={14} height={14} strokeWidth={2} /> : isError ? <X width={14} height={14} strokeWidth={2} /> : <Link2 width={14} height={14} strokeWidth={2} />}
      </span>
      <span className="ppg-share-btn__label">
        {isCopied ? 'Copied' : isError ? 'Failed' : label}
      </span>
    </button>
  );
}

export default HubShareButton;