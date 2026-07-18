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

  const known = execution in LABELS;
  const label = LABELS[execution] || 'Condura';
  const variant = known ? execution : 'unknown';

  return (
    <span
      className={[
        'env-badge',
        'env-badge--condura',
        `env-badge--${variant}`,
        compact ? 'env-badge--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={TOOLTIP}
      aria-label={`${label}. ${TOOLTIP}`}
    >
      <span className="env-badge__mark" aria-hidden>
        <img src={markUrl} alt="" width={14} height={14} />
      </span>
      <span className="env-badge__label">{label}</span>
    </span>
  );
}

export default ConduraBadge;
