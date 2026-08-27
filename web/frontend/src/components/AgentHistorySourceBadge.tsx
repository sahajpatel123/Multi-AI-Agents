import {
  agentHistorySourceFor,
  type AgentHistorySourceItem,
} from '../lib/agentHistorySourceFilter';

const SOURCE_META = {
  standalone: {
    label: 'Standalone',
    title: 'Started directly in Agent Mode',
    background: 'rgba(160, 163, 154, 0.12)',
    color: '#777A72',
  },
  watchlist: {
    label: 'Watchlist',
    title: 'Started by an Agent watchlist item',
    background: 'rgba(240, 184, 78, 0.15)',
    color: '#8C5A2C',
  },
  orchestration: {
    label: 'Orchestration',
    title: 'Started as part of an Agent orchestration',
    background: 'rgba(112, 142, 166, 0.14)',
    color: '#526F86',
  },
} as const;

/** Visible provenance for a task in Agent research history. */
export function AgentHistorySourceBadge({
  item,
}: {
  item?: AgentHistorySourceItem | null;
}) {
  const source = agentHistorySourceFor(item);
  const meta = SOURCE_META[source];

  return (
    <span
      role="img"
      data-source={source}
      title={meta.title}
      aria-label={`Source: ${meta.label}. ${meta.title}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 10,
        letterSpacing: '0.04em',
        borderRadius: 999,
        padding: '1px 7px',
        lineHeight: 1.35,
        background: meta.background,
        color: meta.color,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}
