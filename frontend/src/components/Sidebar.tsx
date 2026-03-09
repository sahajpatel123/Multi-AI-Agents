import { useState } from 'react';
import { ChevronRight, ChevronLeft, History } from 'lucide-react';
import { SessionCard } from './SessionCard';

interface SessionTurn {
  turn_id: string;
  prompt: string;
  winner_id: string;
  timestamp: string;
}

interface SidebarProps {
  turns: SessionTurn[];
  activeTurnId: string | null;
  onTurnClick: (turnId: string) => void;
}

export function Sidebar({ turns, activeTurnId, onTurnClick }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (turns.length === 0) {
    return null;
  }

  // Reverse turns to show newest first
  const reversedTurns = [...turns].reverse();

  return (
    <>
      {/* Toggle button — moves with sidebar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 z-50 p-2 bg-surface border border-border rounded-lg
                   text-text-secondary hover:text-text-primary hover:border-accent/50
                   transition-all duration-300 ease-in-out"
        style={{ left: isOpen ? '276px' : '16px' }}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Sidebar panel */}
      <div
        className={`fixed left-0 top-0 h-full bg-surface border-r border-border z-40
                    transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: '260px' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 text-text-primary">
              <History className="w-4 h-4" />
              <h2 className="font-medium text-sm">Session History</h2>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              {turns.length} {turns.length === 1 ? 'prompt' : 'prompts'}
            </p>
          </div>

          {/* Turn list — newest first */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {reversedTurns.map((turn) => (
              <SessionCard
                key={turn.turn_id}
                prompt={turn.prompt}
                winnerAgentId={turn.winner_id}
                timestamp={turn.timestamp}
                isActive={turn.turn_id === activeTurnId}
                onClick={() => onTurnClick(turn.turn_id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Overlay — close sidebar when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-text-primary/5 z-30 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
