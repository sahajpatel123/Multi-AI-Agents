import { X } from 'lucide-react';
import { AGENTS } from '../types';
import { AgentDot } from './AgentDot';

interface SessionCardProps {
  prompt: string;
  winnerAgentId: string;
  timestamp: string;
  isActive: boolean;
  /** Optional delete affordance — visible on hover/focus so keyboard users can reach it. */
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
  const winnerName = winnerConfig?.name || 'Unknown mind';
  const timeAgo = formatTimeAgo(timestamp);
  const promptPreview = prompt.trim() || 'Untitled session';

  return (
    <div
      className={[
        'session-card',
        isActive ? 'session-card--active' : '',
        onDelete ? 'session-card--deletable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="session-card__main"
        onClick={onClick}
        aria-pressed={isActive}
        aria-label={`Open session: ${promptPreview}`}
      >
        <p className="session-card__prompt">{promptPreview}</p>
        <div className="session-card__meta">
          <div className="session-card__winner">
            {winnerConfig ? (
              <AgentDot agentId={winnerAgentId} size={6} />
            ) : (
              <span className="session-card__dot-fallback" aria-hidden />
            )}
            <span className="session-card__winner-name">{winnerName}</span>
            {messageCount !== undefined && messageCount > 0 ? (
              <span className="session-card__count">· {messageCount} msg</span>
            ) : null}
          </div>
          {timeAgo ? (
            <time className="session-card__time" dateTime={timestamp} title={timestamp}>
              {timeAgo}
            </time>
          ) : (
            <span className="session-card__time" aria-hidden />
          )}
        </div>
      </button>

      {onDelete ? (
        <button
          type="button"
          className="session-card__delete"
          aria-label="Delete session"
          title="Delete session"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X width={12} height={12} strokeWidth={2} aria-hidden />
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
