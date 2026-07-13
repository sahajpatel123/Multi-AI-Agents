import { AGENTS } from '../types';
import { AgentDot } from './AgentDot';

interface SessionCardProps {
  prompt: string;
  winnerAgentId: string;
  timestamp: string;
  isActive: boolean;
  onClick: () => void;
}

export function SessionCard({
  prompt,
  winnerAgentId,
  timestamp,
  isActive,
  onClick,
}: SessionCardProps) {
  const winnerConfig = AGENTS[winnerAgentId];
  const timeAgo = formatTimeAgo(timestamp);

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: '10px',
        border: isActive ? '0.5px solid transparent' : 'none',
        borderLeft: isActive ? '2px solid #C4956A' : 'none',
        background: isActive ? '#F0EBE3' : 'transparent',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = '#F0EBE3';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <p style={{ fontSize: '13px', color: '#1A1714', lineHeight: '1.5', marginBottom: '6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {prompt}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AgentDot agentId={winnerAgentId} size={5} />
          <span style={{ color: '#6B6460' }}>{winnerConfig.name}</span>
        </div>
        <span style={{ color: '#6B6460', opacity: 0.6 }}>{timeAgo}</span>
      </div>
    </button>
  );
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
