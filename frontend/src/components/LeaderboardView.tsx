import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { AGENTS, type SessionTurn } from '../types';
import { AgentDot } from './AgentDot';

interface LeaderboardViewProps {
  turns: SessionTurn[];
  onBack: () => void;
}

export function LeaderboardView({ turns, onBack }: LeaderboardViewProps) {
  const [animatedPercentages, setAnimatedPercentages] = useState<Record<string, number>>({});
  const [pageVisible, setPageVisible] = useState(false);
  const [showPercentages, setShowPercentages] = useState(false);

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
    setPageVisible(false);
    setShowPercentages(false);

    const frameId = window.requestAnimationFrame(() => {
      setPageVisible(true);
    });

    const barTimer = window.setTimeout(() => {
      setAnimatedPercentages(
        leaderboard.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.agent.agent_id] = entry.percentage;
          return acc;
        }, {}),
      );
    }, 40);

    const percentageTimer = window.setTimeout(() => {
      setShowPercentages(true);
    }, 700);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(barTimer);
      window.clearTimeout(percentageTimer);
    };
  }, [leaderboard]);

  return (
    <div
      className="max-w-4xl mx-auto px-4 py-12"
      style={{
        opacity: pageVisible ? 1 : 0,
        transform: pageVisible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 350ms ease, transform 350ms ease',
      }}
    >
      <div className="mb-10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2"
          style={{
            background: '#F0EBE3',
            border: '1px solid #E0D8D0',
            borderRadius: '999px',
            padding: '6px 14px',
            fontSize: '13px',
            color: '#6B6460',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#E0D8D0';
            e.currentTarget.style.color = '#1A1714';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F0EBE3';
            e.currentTarget.style.color = '#6B6460';
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <div className="flex items-center gap-3">
          <Trophy style={{ width: '28px', height: '28px', color: '#C4956A' }} />
          <h1
            className="font-serif text-text-primary"
            style={{ fontSize: '28px', fontWeight: 600 }}
          >
            Agent Leaderboard
          </h1>
        </div>
        <p style={{ color: '#6B6460', fontSize: '13px', marginTop: '8px' }}>
          Based on your session history · {turns.length} {turns.length === 1 ? 'prompt' : 'prompts'}
        </p>
      </div>

      <div
        style={{
          height: '1px',
          background: '#E0D8D0',
          marginBottom: '32px',
        }}
      />

      {turns.length === 0 ? (
        <div className="py-24 text-center">
          <Trophy style={{ width: '40px', height: '40px', color: '#E0D8D0', margin: '0 auto' }} />
          <p style={{ fontSize: '15px', color: '#6B6460', marginTop: '12px' }}>
            No winners yet
          </p>
          <p style={{ fontSize: '13px', color: '#6B6460', marginTop: '6px' }}>
            Ask your first question to start tracking which agent wins most
          </p>
        </div>
      ) : (
        <div>
          {leaderboard.map(({ agent, wins, percentage }, index) => {
            const isTopRank = index === 0;
            return (
              <div
                key={agent.agent_id}
                style={{
                  marginBottom: '36px',
                  opacity: pageVisible ? 1 : 0,
                  transform: pageVisible ? 'translateY(0)' : 'translateY(8px)',
                  transition: `opacity 350ms ease ${index * 80}ms, transform 350ms ease ${index * 80}ms`,
                  background: isTopRank ? '#F0EBE3' : 'transparent',
                  border: isTopRank ? '1px solid #E0D8D0' : '1px solid transparent',
                  borderRadius: isTopRank ? '12px' : '0',
                  padding: isTopRank ? '16px' : '0',
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center">
                    <span
                      style={{
                        width: '24px',
                        marginRight: '16px',
                        fontSize: '13px',
                        color: isTopRank ? '#C4956A' : '#6B6460',
                      }}
                    >
                      #{index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <AgentDot agentId={agent.agent_id} size={10} />
                      <span style={{ fontWeight: 600, fontSize: '15px', color: '#1A1714' }}>
                        {agent.name}
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      background: '#F0EBE3',
                      border: '1px solid #E0D8D0',
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '12px',
                      color: '#1A1714',
                    }}
                  >
                    {wins} {wins === 1 ? 'win' : 'wins'}
                  </span>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <div
                    style={{
                      opacity: showPercentages ? 1 : 0,
                      transition: 'opacity 150ms ease',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: agent.color }}>
                      {Math.round(percentage)}%
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '3px',
                      background: '#E0D8D0',
                      borderRadius: '999px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${animatedPercentages[agent.agent_id] || 0}%`,
                        height: '100%',
                        background: agent.color,
                        borderRadius: '999px',
                        transition: 'width 700ms ease-out',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
