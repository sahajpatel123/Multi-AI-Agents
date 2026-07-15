import type { ExecutionEnvironment } from '../types/condura';
import markUrl from '../assets/condura/mark.svg';

const LABELS: Record<string, string> = {
  condura: 'Needs Condura',
  hybrid_prep: 'Powered by Condura',
  hybrid_delegate: 'Runs on Condura',
};

const TOOLTIP =
  'Arena is web-only. On-device actions need Condura on your computer — not this browser. Cloud accounts (Notion.com, GitHub.com) still connect through Arena.';

export function ConduraBadge({
  execution,
  compact,
}: {
  execution: ExecutionEnvironment | string | undefined;
  compact?: boolean;
}) {
  if (!execution || execution === 'web') return null;
  const label = LABELS[execution] || 'Condura';
  return (
    <span
      className="env-badge env-badge--condura"
      title={TOOLTIP}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: compact ? 11 : 12,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        background: 'rgba(196,149,106,0.12)',
        color: '#8c7355',
        border: '0.5px solid rgba(196,149,106,0.35)',
        fontFamily: 'Georgia, serif',
        whiteSpace: 'nowrap',
      }}
    >
      <img src={markUrl} alt="" width={14} height={14} style={{ display: 'block' }} />
      {label}
    </span>
  );
}

export default ConduraBadge;
