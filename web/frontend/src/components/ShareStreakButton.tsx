import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import {
  buildShareStreakText,
  type DailyStreakState,
} from '../lib/dailyStreak';
import { copyToClipboard } from '../lib/clipboard';
import { recordRecentShare } from '../lib/recentShares';

export interface ShareStreakButtonProps {
  /** Current streak state — the button reads `current` and `longest`. */
  streak: DailyStreakState;
  /** Origin used to build the share URL. Defaults to the runtime origin. */
  origin?: string;
  /** Label shown on the button. */
  label?: string;
}

/**
 * Copy-to-clipboard CTA that surfaces a pre-formatted share message
 * for the current streak. Renders nothing when the streak is &lt; 1.
 * Mirrors the compare-page copy-button pattern: useRef for the reset
 * timer, transient "Copied" confirmation, 1800ms reset.
 */
export function ShareStreakButton({
  streak,
  origin,
  label = 'Share my streak',
}: ShareStreakButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    };
  }, []);

  const resolvedOrigin =
    origin ?? (typeof window === 'undefined' ? '' : window.location.origin);

  const text = buildShareStreakText(streak, resolvedOrigin);

  // Hooks must be called unconditionally — move useCallback above the
  // early-return so React's hook count stays stable across renders
  // where `text` toggles between null and non-null.
  const onClick = useCallback(async () => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setCopied(false), 1800);
    if (typeof window !== 'undefined') {
      const url = `${resolvedOrigin.replace(/\/$/, '')}/persona-playground`;
      recordRecentShare(window.localStorage, {
        kind: 'streak',
        label: `${streak.current}-day streak`,
        url,
      });
    }
  }, [text, resolvedOrigin, streak.current]);

  if (!text) return null;

  return (
    <button
      type="button"
      className={`ppg-share-streak${copied ? ' ppg-share-streak--copied' : ''}`}
      onClick={onClick}
      aria-live="polite"
    >
      {copied ? (
        <>
          <Check aria-hidden="true" />
          <span>Streak copied</span>
        </>
      ) : (
        <>
          <Share2 aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
