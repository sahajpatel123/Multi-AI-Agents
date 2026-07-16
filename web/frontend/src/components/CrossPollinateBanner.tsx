import { ArrowLeftRight } from 'lucide-react';

interface CrossPollinateBannerProps {
  sourceTaskId: string | null;
  onDismiss: () => void;
  intelScore?: number | null;
}

/** Banner showing that an answer is being cross-pollinated through the Arena */
export function CrossPollinateBanner({
  sourceTaskId,
  onDismiss,
  intelScore,
}: CrossPollinateBannerProps) {
  if (!sourceTaskId) return null;

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
        color: '#7289BE',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      <ArrowLeftRight size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
        {intelScore !== null && intelScore !== undefined
          ? `Cross-pollinating Agent answer (IQ: ${intelScore}/100) — gathering perspectives from 4 minds`
          : 'Cross-pollinating Agent answer — gathering perspectives from 4 minds'}
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