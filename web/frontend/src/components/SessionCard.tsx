import { useState } from 'react';
import { AGENTS } from '../types';
import { AgentDot } from './AgentDot';

interface SessionCardProps {
  prompt: string;
  winnerAgentId: string;
  timestamp: string;
  isActive: boolean;
  /** Optional delete affordance — when provided, a small × button
   *  appears on hover. The button's onClick stops propagation so the
   *  parent card onClick isn't also fired. */
  onDelete?: () => void;
  /** Optional count of saved/messages/etc. rendered in the meta line. */
  messageCount?: number;
  onClick: () => void;
}

export function SessionCard({
  prompt,
  winnerAgentId,
  timestamp,
  isActive,
  onClick,
  onDelete,
  messageCount,
}: SessionCardProps) {
  const winnerConfig = AGENTS[winnerAgentId];
  const timeAgo = formatTimeAgo(timestamp);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative' }}
    >
      <button
        onClick={onClick}
        aria-pressed={isActive}
        aria-label={`Open session: ${prompt}`}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '8px 10px',
          paddingRight: onDelete && hovered ? '28px' : '10px',
          borderRadius: '10px',
          border: isActive ? '0.5px solid transparent' : 'none',
          borderLeft: isActive ? '2px solid #C4956A' : 'none',
          background: isActive ? '#F0EBE3' : 'transparent',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = '#F0EBE3';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        }}
      >
        <p
          style={{
            fontSize: '13px',
            color: '#1A1714',
            lineHeight: '1.5',
            marginBottom: '6px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {prompt}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
            <AgentDot agentId={winnerAgentId} size={5} />
            <span style={{ color: '#6B6460', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {winnerConfig.name}
            </span>
            {messageCount !== undefined && messageCount > 0 ? (
              <span style={{ color: '#6B6460', opacity: 0.6 }}>· {messageCount} msg</span>
            ) : null}
          </div>
          <span style={{ color: '#6B6460', opacity: 0.6, whiteSpace: 'nowrap' }}>{timeAgo}</span>
        </div>
      </button>
      {onDelete && hovered ? (
        <button
          type="button"
          aria-label="Delete session"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: 'absolute',
            right: 6,
            top: 6,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '0.5px solid rgba(107, 100, 96, 0.25)',
            borderRadius: 6,
            color: '#6B6460',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function formatTimeAgo(timestamp: string): string {
  // Defensive against invalid input — `new Date('invalid')` returns
  // NaN without throwing, which would propagate and render as
  // "NaNm ago" in the UI.
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return '';
  const diffMs = Date.now() - ms;
  // Future timestamps (clock skew between client and server) show
  // as 'just now' rather than negative durations.
  if (diffMs < 0) return 'just now';
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  // A year+ old is more useful as an absolute date than a vague
  // "412d ago" — the sidebar is small and absolute dates are easier
  // to scan than huge numbers.
  if (diffDays >= 365) {
    return new Date(ms).toLocaleDateString();
  }
  return `${diffDays}d ago`;
}
