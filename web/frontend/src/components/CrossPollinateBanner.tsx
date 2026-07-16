import { ArrowLeftRight } from 'lucide-react';

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

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'rgba(114, 137, 190, 0.08)',
        borderRadius: 12,
        padding: '10px 14px',
        marginBottom: '1rem',
        maxWidth: 600,
        marginLeft: 'auto',
        marginRight: 'auto',
        fontSize: 13,
        color: '#5A6B9A',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      <ArrowLeftRight size={16} style={{ flexShrink: 0 }} aria-hidden />
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
        {score != null
          ? `Cross-pollinating Agent answer (score ${score}/100) — four minds will review it`
          : 'Cross-pollinating Agent answer — four minds will review it'}
      </span>
      <button
        type="button"
        aria-label="Dismiss cross-pollination notice"
        onClick={onDismiss}
        style={{
          flexShrink: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          color: '#A89070',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
