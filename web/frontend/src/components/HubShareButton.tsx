import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Check, Link2, X } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';

export interface HubShareButtonHandle {
  /** Imperatively trigger the copy + label transition. */
  trigger: () => Promise<void>;
}

export interface HubShareButtonProps {
  /** Label for the button when idle. */
  label?: string;
  /** Override the URL to copy; defaults to window.location.href at click time. */
  url?: string;
  /** Optional className for the button. */
  className?: string;
  /** Tooltip / title attribute (also announced via aria-describedby). */
  hint?: string;
}

type Status = 'idle' | 'copied' | 'error';

const REVERT_AFTER_MS = 1600;

/**
 * "Copy link to this view" button. Captures the current URL (or an
 * override) and writes it to the clipboard via the safe
 * `copyToClipboard` helper. Shows a transient "Copied" / "Failed"
 * badge for ~1.6s before reverting to the idle label.
 *
 * Exposes a `trigger()` imperative method via ref so the page can
 * wire a keyboard shortcut (e.g. Shift+L) without prop-drilling the
 * click handler through every consumer.
 */
export const HubShareButton = forwardRef<HubShareButtonHandle, HubShareButtonProps>(
  function HubShareButton(
    { label = 'Copy link to this view', url, className = 'ppg-share-btn', hint },
    ref,
  ) {
    const [status, setStatus] = useState<Status>('idle');
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      };
    }, []);

    const doCopy = useCallback(async () => {
      const target = url ?? (typeof window !== 'undefined' ? window.location.href : '');
      if (!target) {
        setStatus('error');
      } else {
        const ok = await copyToClipboard(target);
        setStatus(ok ? 'copied' : 'error');
      }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setStatus('idle'), REVERT_AFTER_MS);
    }, [url]);

    useImperativeHandle(
      ref,
      () => ({ trigger: doCopy }),
      [doCopy],
    );

    const isCopied = status === 'copied';
    const isError = status === 'error';
    const ariaLabel = isCopied
      ? 'Link copied to clipboard'
      : isError
        ? 'Copy link failed'
        : label;

    return (
      <button
        type="button"
        className={className}
        onClick={doCopy}
        aria-live="polite"
        aria-label={ariaLabel}
        title={hint}
      >
        <span className="ppg-share-btn__icon" aria-hidden>
          {isCopied ? <Check width={14} height={14} strokeWidth={2} /> : isError ? <X width={14} height={14} strokeWidth={2} /> : <Link2 width={14} height={14} strokeWidth={2} />}
        </span>
        <span className="ppg-share-btn__label">
          {isCopied ? 'Copied' : isError ? 'Failed' : label}
        </span>
      </button>
    );
  },
);

export default HubShareButton;
