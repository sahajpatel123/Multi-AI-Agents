import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AGENTS, type SessionTurn } from '../types';
import { AgentDot } from './AgentDot';

interface LeaderboardViewProps {
  turns: SessionTurn[];
  onBack: () => void;
}

export function LeaderboardView({ turns, onBack }: LeaderboardViewProps) {
  const [animatedPercentages, setAnimatedPercentages] = useState<Record<string, number>>({});

  const leaderboard = useMemo(() => {
    const totalWins = turns.length;
    const winsByAgent = turns.reduce<Record<string, number>>((acc, turn) => {
      acc[turn.winner_id] = (acc[turn.winner_id] || 0) + 1;
      return acc;
    }, {});

    return Object.values(AGENTS)
      .map((agent) => {
        const wins = winsByAgent[agent.agent_id] || 0;
        const percentage = totalWins > 0 ? (wins / totalWins) * 100 : 0;
        return { agent, wins, percentage };
      })
      .sort((a, b) => b.wins - a.wins);
  }, [turns]);

  useEffect(() => {
    setAnimatedPercentages({});
    const timeoutId = window.setTimeout(() => {
      setAnimatedPercentages(
        leaderboard.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.agent.agent_id] = entry.percentage;
          return acc;
        }, {}),
      );
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [leaderboard]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="mb-12">
        <h1 className="font-serif text-4xl font-semibold text-text-primary">Agent Leaderboard</h1>
        <p className="mt-2 text-sm" style={{ color: '#6B6460' }}>
          Based on your session history
        </p>
      </div>

      {turns.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-sm" style={{ color: '#6B6460' }}>
            Ask your first question to start the leaderboard
          </p>
        </div>
      ) : (
        <div>
          {leaderboard.map(({ agent, wins, percentage }) => (
            <div key={agent.agent_id} style={{ marginBottom: '32px' }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <AgentDot agentId={agent.agent_id} size={10} />
                  <span className="font-bold" style={{ color: '#1A1714' }}>
                    {agent.name}
                  </span>
                </div>
                <span className="text-sm" style={{ color: '#6B6460' }}>
                  {wins} {wins === 1 ? 'win' : 'wins'}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <div style={{ height: '2px', background: '#E0D8D0', position: 'relative', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${animatedPercentages[agent.agent_id] || 0}%`,
                        background: agent.color,
                        transition: 'width 600ms ease-out',
                      }}
                    />
                  </div>
                </div>
                <span className="text-xs font-medium" style={{ color: agent.color }}>
                  {Math.round(percentage)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
