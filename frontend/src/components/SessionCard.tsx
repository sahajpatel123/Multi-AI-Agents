import { AGENTS } from '../types';

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
      className={`w-full text-left p-3 rounded-lg border transition-all duration-300
                  ${isActive 
                    ? 'bg-background border-accent/50' 
                    : 'bg-surface border-border hover:border-text-secondary/30'
                  }`}
    >
      <p className="text-sm text-text-primary line-clamp-2 leading-relaxed mb-2">
        {prompt}
      </p>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: winnerConfig.color }}
          />
          <span className="text-text-secondary">{winnerConfig.name}</span>
        </div>
        <span className="text-text-secondary/60">{timeAgo}</span>
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
