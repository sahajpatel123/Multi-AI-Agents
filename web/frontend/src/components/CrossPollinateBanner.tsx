import { ArrowLeftRight, X } from 'lucide-react';
import { prefersReducedMotion } from '../lib/motion';

interface CrossPollinateBannerProps {
  sourceTaskId: string | null;
  onDismiss: () => void;
  intelScore?: number | null;
}

/** Banner showing that an Agent answer is being reviewed by the Arena panel. */
export function CrossPollinateBanner({
  sourceTaskId,
  onDismiss,
  intelScore,
}: CrossPollinateBannerProps) {
  if (!sourceTaskId) return null;

  const score =
    typeof intelScore === 'number' && Number.isFinite(intelScore)
      ? Math.round(intelScore)
      : null;
  const reduceMotion = prefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'cross-pollinate-banner',
        score != null ? 'cross-pollinate-banner--scored' : '',
        reduceMotion ? 'cross-pollinate-banner--static' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="cross-pollinate-banner__icon" aria-hidden>
        <ArrowLeftRight width={15} height={15} strokeWidth={1.75} />
      </span>

      <div className="cross-pollinate-banner__body">
        <span className="cross-pollinate-banner__kicker">Cross-pollination</span>
        <p className="cross-pollinate-banner__message">
          {score != null ? (
            <>
              Agent answer (
              <span className="cross-pollinate-banner__score" title="Agent intelligence score">
                {score}/100
              </span>
              ) — four minds will review it
            </>
          ) : (
            'Agent answer — four minds will review it'
          )}
        </p>
      </div>

      <button
        type="button"
        className="cross-pollinate-banner__dismiss"
        aria-label="Dismiss cross-pollination notice"
        title="Dismiss"
        onClick={onDismiss}
      >
        <X width={14} height={14} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
