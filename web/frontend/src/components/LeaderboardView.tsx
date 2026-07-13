import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { AGENTS, type SessionTurn } from '../types';
import { AgentDot } from './AgentDot';

interface LeaderboardViewProps {
  turns: SessionTurn[];
  onBack: () => void;
}

const RANK_LABELS = ['#1', '#2', '#3', '#4'];

export function LeaderboardView({ turns, onBack }: LeaderboardViewProps) {
  const [animatedWidths, setAnimatedWidths] = useState<Record<string, number>>({});
  const [showNumbers, setShowNumbers] = useState(false);
  const [visible, setVisible] = useState(false);

  const leaderboard = useMemo(() => {
    const winsByAgent = turns.reduce<Record<string, number>>((acc, turn) => {
      acc[turn.winner_id] = (acc[turn.winner_id] || 0) + 1;
      return acc;
    }, {});

    return Object.values(AGENTS)
      .map((agent) => {
        const wins = winsByAgent[agent.agent_id] || 0;
        const percentage = turns.length > 0 ? (wins / turns.length) * 100 : 0;
        return { agent, wins, percentage };
      })
      .sort((a, b) => b.wins - a.wins);
  }, [turns]);

  useEffect(() => {
    setAnimatedWidths({});
    setShowNumbers(false);
    setVisible(false);

    const frameId = requestAnimationFrame(() => setVisible(true));

    const barTimer = setTimeout(() => {
      setAnimatedWidths(
        leaderboard.reduce<Record<string, number>>((acc, { agent, percentage }) => {
          acc[agent.agent_id] = percentage;
          return acc;
        }, {}),
      );
    }, 60);

    const numTimer = setTimeout(() => setShowNumbers(true), 680);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(barTimer);
      clearTimeout(numTimer);
    };
  }, [leaderboard]);

  const totalPrompts = turns.length;
  const topAgent = leaderboard[0];
  const hasData = totalPrompts > 0;

  return (
    <div
      className="leaderboard-container"
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '32px 24px 64px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 300ms ease, transform 300ms ease',
      }}
    >
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'transparent',
          border: 'none',
          padding: '4px 0',
          fontSize: '13px',
          color: '#8A8078',
          cursor: 'pointer',
          marginBottom: '28px',
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#1A1714')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#8A8078')}
      >
        <ArrowLeft style={{ width: '14px', height: '14px' }} />
        Back to Arena
      </button>

      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Trophy style={{ width: '20px', height: '20px', color: '#C4956A', flexShrink: 0 }} />
          <h1 style={{ fontSize: '22px', fontWeight: 500, color: '#1A1714', letterSpacing: '-0.02em', margin: 0 }}>
            Agent Leaderboard
          </h1>
        </div>
        <p style={{ fontSize: '13px', color: '#9A9088', margin: 0 }}>
          {hasData
            ? `Based on ${totalPrompts} ${totalPrompts === 1 ? 'prompt' : 'prompts'} in this session`
            : 'Win rates will appear once you start prompting'}
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: '0.5px', background: '#E8E0D8', marginBottom: '32px' }} />

      {hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {leaderboard.map(({ agent, wins, percentage }, index) => {
            const isFirst = index === 0;
            const width = animatedWidths[agent.agent_id] ?? 0;

            return (
              <div
                className="agent-row"
                key={agent.agent_id}
                style={{
                  padding: '18px 20px',
                  borderRadius: '14px',
                  background: isFirst ? '#FFFFFF' : 'transparent',
                  border: isFirst ? '0.5px solid #E0D8D0' : '0.5px solid transparent',
                  marginBottom: '8px',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(6px)',
                  transition: `opacity 300ms ease ${index * 70}ms, transform 300ms ease ${index * 70}ms, background 150ms ease`,
                  boxShadow: isFirst ? '0 2px 12px rgba(26,23,20,0.06)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  {/* Left: rank + agent */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isFirst ? '#C4956A' : '#B0A898',
                      letterSpacing: '0.05em',
                      width: '20px',
                      flexShrink: 0,
                    }}>
                      {RANK_LABELS[index]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AgentDot agentId={agent.agent_id} size={isFirst ? 9 : 7} />
                      <span style={{
                        fontSize: isFirst ? '15px' : '14px',
                        fontWeight: isFirst ? 500 : 400,
                        color: '#1A1714',
                      }}>
                        {agent.name}
                      </span>
                    </div>
                  </div>

                  {/* Right: wins + percentage */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      opacity: showNumbers ? 1 : 0,
                      transition: 'opacity 200ms ease',
                      fontSize: '12px',
                      color: agent.color,
                      fontWeight: 500,
                      minWidth: '32px',
                      textAlign: 'right',
                    }}>
                      {Math.round(percentage)}%
                    </span>
                    <span className="win-badge" style={{
                      background: isFirst ? '#F5EEE6' : '#F0EBE3',
                      border: `0.5px solid ${isFirst ? 'rgba(196,149,106,0.2)' : '#E0D8D0'}`,
                      borderRadius: '999px',
                      padding: '3px 10px',
                      fontSize: '12px',
                      color: isFirst ? '#C4956A' : '#6B6460',
                      fontWeight: isFirst ? 500 : 400,
                      whiteSpace: 'nowrap',
                    }}>
                      {wins} {wins === 1 ? 'win' : 'wins'}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: isFirst ? '4px' : '3px', background: '#F0EBE3', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${width}%`,
                      height: '100%',
                      background: agent.color,
                      borderRadius: '999px',
                      transition: 'width 800ms cubic-bezier(0.16,1,0.3,1)',
                      opacity: isFirst ? 1 : 0.7,
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty state */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '60px 24px',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '0.5px solid #E8E0D8',
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: '#F5EEE6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}>
            <Trophy style={{ width: '22px', height: '22px', color: '#C4956A' }} />
          </div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714', margin: '0 0 6px' }}>
            No data yet
          </p>
          <p style={{ fontSize: '13px', color: '#9A9088', textAlign: 'center', margin: 0, maxWidth: '260px', lineHeight: '1.6' }}>
            Ask your first question in the Arena and this leaderboard will start tracking who wins.
          </p>
          <button
            type="button"
            onClick={onBack}
            style={{
              marginTop: '24px',
              padding: '8px 20px',
              borderRadius: '999px',
              background: '#1A1714',
              color: '#FAF7F4',
              border: 'none',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'opacity 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Go to Arena
          </button>
        </div>
      )}

      {/* Footer stat — only when there's data */}
      {hasData && topAgent && topAgent.wins > 0 && (
        <div style={{
          marginTop: '28px',
          padding: '14px 18px',
          borderRadius: '10px',
          background: 'transparent',
          border: '0.5px solid #E8E0D8',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AgentDot agentId={topAgent.agent.agent_id} size={6} />
          <p style={{ fontSize: '12px', color: '#9A9088', margin: 0 }}>
            <span style={{ color: '#1A1714', fontWeight: 500 }}>{topAgent.agent.name}</span>
            {' '}is currently leading with{' '}
            <span style={{ color: '#C4956A', fontWeight: 500 }}>{Math.round(topAgent.percentage)}% win rate</span>
            {' '}across {totalPrompts} {totalPrompts === 1 ? 'prompt' : 'prompts'}.
          </p>
        </div>
      )}
    </div>
  );
}
