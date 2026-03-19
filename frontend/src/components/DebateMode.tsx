import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { streamDebateRound } from '../api';
import {
  ScoredAgent,
  DebateMessage,
  DebateReaction,
  AGENTS,
} from '../types';
import { AgentDot } from './AgentDot';
import { usePanel } from '../context/PanelContext';

interface DebateModeProps {
  originalPrompt: string;
  challengedAgent: ScoredAgent;
  sessionId: string;
  onExit: () => void;
  onSuccess?: () => void;
}

type DebatePhase = 'idle' | 'streaming' | 'done';

const AGENT_SLOT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'];

interface DebateRound {
  roundNumber: number;
  reactions: DebateReaction[];
  userInterjection?: string;
}

function getRoundSummary(round: DebateRound) {
  const leadAgent = round.reactions[0];
  if (!leadAgent) return `Round ${round.roundNumber} — The arena responded`;
  const leadName = AGENTS[leadAgent.agent_id]?.name ?? leadAgent.agent_id;
  return `Round ${round.roundNumber} — ${leadName} struck back`;
}

const AGENT_BG_TINTS: Record<string, string> = {
  agent_1: '#EEF0F2',
  agent_2: '#F0EDF2',
  agent_3: '#EDF2EF',
  agent_4: '#F2EDE8',
};

export function DebateMode({
  originalPrompt,
  challengedAgent,
  sessionId,
  onExit,
  onSuccess,
}: DebateModeProps) {
  const { panel } = usePanel();

  const panelByAgentId = useMemo(
    () =>
      AGENT_SLOT_IDS.reduce<Record<string, { name: string; color: string }>>((acc, id, i) => {
        const persona = panel[i];
        if (persona) acc[id] = { name: persona.name, color: persona.color };
        return acc;
      }, {}),
    [panel],
  );

  const getAgentDisplay = (agentId: string) => {
    return panelByAgentId[agentId] ?? AGENTS[agentId] ?? { name: agentId, color: '#888888' };
  };

  const [phase, setPhase] = useState<DebatePhase>('idle');
  const [rounds, setRounds] = useState<DebateRound[]>([]);
  const [debateHistory, setDebateHistory] = useState<DebateMessage[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({});

  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [doneAgents, setDoneAgents] = useState<Set<string>>(new Set());
  const tokenBuffers = useRef<Record<string, string>>({});
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [interjection, setInterjection] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const challengedConfig = getAgentDisplay(challengedAgent.response.agent_id);
  const reactingIds = AGENT_SLOT_IDS.filter(
    (id) => id !== challengedAgent.response.agent_id
  );

  const flushTokens = useCallback(() => {
    setStreamingTexts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, text] of Object.entries(tokenBuffers.current)) {
        if (next[id] !== text) {
          next[id] = text;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const runRound = async (userMessage?: string) => {
    const nextRound = currentRound + 1;
    if (nextRound > 3) return;

    setPhase('streaming');
    setError(null);
    setStreamingTexts({});
    setDoneAgents(new Set());
    tokenBuffers.current = {};

    flushTimer.current = setInterval(flushTokens, 50);

    try {
      await streamDebateRound(
        {
          original_prompt: originalPrompt,
          challenged_agent_id: challengedAgent.response.agent_id,
          challenged_verdict: challengedAgent.response.verdict,
          round_number: nextRound,
          debate_history: debateHistory,
          user_interjection: userMessage || null,
          session_id: sessionId,
          persona_ids: panel.map((persona) => persona.id),
        },
        {
          onReactionToken: (data) => {
            tokenBuffers.current[data.agent_id] =
              (tokenBuffers.current[data.agent_id] || '') + data.token;
          },
          onReactionDone: (data) => {
            setDoneAgents((prev) => new Set(prev).add(data.agent_id));
            scrollToBottom();
          },
          onResult: (data) => {
            flushTokens();
            if (flushTimer.current) clearInterval(flushTimer.current);

            setRounds((prev) => [
              ...prev,
              {
                roundNumber: nextRound,
                reactions: data.reactions,
                userInterjection: userMessage,
              },
            ]);
            setDebateHistory(data.debate_history);
            setCurrentRound(nextRound);
            setPhase('done');
            scrollToBottom();

            if (onSuccess) onSuccess();
          },
          onError: (data) => {
            if (flushTimer.current) clearInterval(flushTimer.current);
            setError(data.detail);
            setPhase('done');
          },
        }
      );
    } catch (err) {
      if (flushTimer.current) clearInterval(flushTimer.current);
      setError(err instanceof Error ? err.message : 'Debate round failed');
      setPhase('done');
    }
  };

  const handleInterjection = () => {
    const msg = interjection.trim();
    if (!msg) return;
    setInterjection('');
    runRound(msg);
  };

  const canStartNewRound = phase !== 'streaming' && currentRound < 3;
  const previousRounds = rounds.slice(0, -1);
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const isPreDebate = currentRound === 0 && phase === 'idle';

  const toggleRound = (roundNumber: number) => {
    setExpandedRounds((prev) => ({ ...prev, [roundNumber]: !prev[roundNumber] }));
  };

  const renderReactionCard = (
    reaction: DebateReaction,
    index: number,
    cardType: 'history' | 'current' | 'streaming',
    text?: string,
    isDone?: boolean,
  ) => {
    const agent = getAgentDisplay(reaction.agent_id);
    const content = text ?? reaction.content;
    const isStreaming = cardType === 'streaming';

    return (
      <div
        key={`${cardType}-${reaction.agent_id}-${index}`}
        className={`debate-colosseum-card reaction-card ${isStreaming ? 'debate-reaction-enter' : ''}`}
        style={{
          marginLeft: '64px',
          maxWidth: '600px',
          position: 'relative',
          animationDelay: isStreaming ? `${index * 100}ms` : `${450 + index * 100}ms`,
        }}
      >
        <div
          className={isStreaming && content ? 'debate-timeline-dot-pulse' : ''}
          style={{
            position: 'absolute',
            left: '-44px',
            top: '20px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: agent.color,
            border: '2px solid #FAF7F4',
            boxShadow: `0 0 0 3px ${agent.color}33`,
          }}
        />
        <div
          className="timeline-line"
          style={{
            position: 'absolute',
            left: 0,
            top: '16px',
            bottom: '16px',
            width: '3px',
            background: agent.color,
            borderRadius: '999px',
          }}
        />
        <div
          style={{
            background: '#FFFFFF',
            border: '0.5px solid #E0D8D0',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            transition: 'all 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateX(4px)';
            e.currentTarget.style.borderColor = agent.color;
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,23,20,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.borderColor = '#E0D8D0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <AgentDot agentId={reaction.agent_id} size={7} />
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>
              {agent.name}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#6B6460', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Reaction {index + 1}
            </span>
          </div>
          {content ? (
            <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {content}
              {isStreaming && !isDone ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '16px',
                    marginLeft: '3px',
                    background: 'rgba(107,100,96,0.45)',
                    animation: 'breathe 1.2s ease-in-out infinite',
                    verticalAlign: 'text-bottom',
                  }}
                />
              ) : null}
            </p>
          ) : (
            <div style={{ fontSize: '20px', letterSpacing: '4px', color: agent.color }} className="debate-thinking-pulse">
              ...
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRoundSection = (round: DebateRound, isHistory: boolean) => (
    <div key={round.roundNumber} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {round.userInterjection ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
          <div style={{ maxWidth: '420px', background: '#1A1714', borderRadius: '14px', padding: '12px 14px' }}>
            <p style={{ fontSize: '14px', color: '#FAF7F4', lineHeight: 1.7 }}>{round.userInterjection}</p>
            <p style={{ fontSize: '11px', color: 'rgba(250,247,244,0.5)', marginTop: '4px' }}>You</p>
          </div>
        </div>
      ) : null}

      <div style={{ position: 'relative', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
        <div
          style={{
            position: 'absolute',
            left: '28px',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'linear-gradient(to bottom, #E0D8D0, transparent)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {round.reactions.map((reaction, index) => renderReactionCard(reaction, index, isHistory ? 'history' : 'current'))}
        </div>
      </div>
    </div>
  );

  const challengedCard = (
    <div className="debate-colosseum-enter challenged-card" style={{ maxWidth: '680px', margin: '0 auto 40px', width: '100%' }}>
      <div
        style={{
          background: '#FFFFFF',
          border: `1px solid ${challengedConfig.color}`,
          borderRadius: '20px',
          padding: '2rem',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: challengedConfig.color,
            borderRadius: '20px 20px 0 0',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: challengedConfig.color, animation: 'breathe 2.4s ease-in-out infinite' }} />
            <span style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714' }}>
              {challengedConfig.name}
            </span>
            <span
              style={{
                background: `${challengedConfig.color}1F`,
                color: challengedConfig.color,
                border: `0.5px solid ${challengedConfig.color}`,
                borderRadius: '999px',
                padding: '3px 10px',
                fontSize: '11px',
                letterSpacing: '.05em',
              }}
            >
              challenged
            </span>
          </div>
          <span style={{ fontSize: '10px', letterSpacing: '.2em', textTransform: 'uppercase', color: '#6B6460' }}>
            In the arena
          </span>
        </div>
        <div style={{ height: '0.5px', background: '#F0EBE3', margin: '14px 0' }} />
        <p style={{ fontSize: '15px', color: '#1A1714', lineHeight: 1.8, fontWeight: 400 }}>
          {challengedAgent.response.verdict}
        </p>
        <div
          style={{
            marginTop: '14px',
            padding: '12px 14px',
            background: '#FAF7F4',
            borderRadius: '10px',
            borderLeft: `2px solid ${challengedConfig.color}`,
          }}
        >
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '4px' }}>
            Key assumption
          </div>
          <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.6, fontStyle: 'italic' }}>
            {challengedAgent.response.key_assumption}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="debate-layout" style={{ minHeight: '100vh', background: '#FAF7F4', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div className="noise-overlay" />
      <div
        style={{
          position: 'fixed',
          top: '-100px',
          right: '-100px',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,149,106,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
      `}</style>

      <div
        style={{
          height: '52px',
          background: 'rgba(250,247,244,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '0.5px solid #E0D8D0',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '0 24px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={onExit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#F0EBE3',
              border: '0.5px solid #E0D8D0',
              borderRadius: '999px',
              padding: '6px 14px',
              fontSize: '13px',
              color: '#6B6460',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
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
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Back to Arena
          </button>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C4956A', animation: 'breathe 2.4s ease-in-out infinite' }} />
          <span style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '96px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#6B6460', letterSpacing: '.08em', textTransform: 'uppercase', marginRight: '4px' }}>Round</span>
              <span style={{ fontSize: '18px', fontWeight: 500, color: '#1A1714' }}>{Math.max(currentRound, phase === 'streaming' ? currentRound + 1 : currentRound || 1)}</span>
              <span style={{ color: '#6B6460' }}>/</span>
              <span style={{ fontSize: '14px', color: '#6B6460' }}>3</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {[1, 2, 3].map((dot) => {
                const activeRound = Math.max(currentRound, phase === 'streaming' ? currentRound + 1 : currentRound || 1);
                const state = dot < activeRound ? 'done' : dot === activeRound ? 'active' : 'upcoming';
                return (
                  <div
                    key={dot}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: state === 'active' ? '#C4956A' : state === 'done' ? 'rgba(26,23,20,0.3)' : 'transparent',
                      border: state === 'upcoming' ? '0.5px solid #E0D8D0' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {isPreDebate ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 32px', position: 'relative', zIndex: 1 }}>
          <div className="debate-pre-layout">
            <div>
              {challengedCard}
              <p style={{ fontSize: '13px', color: '#6B6460', fontStyle: 'italic', marginTop: '16px', padding: '12px 0', lineHeight: 1.5, maxWidth: '680px' }}>
                {originalPrompt}
              </p>
            </div>

            <div className="debate-pre-action-column">
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '12px' }}>
                  Waiting to react
                </div>
                <div className="debate-pre-pill-stack">
                  {reactingIds.map((id, index) => {
                    const agent = getAgentDisplay(id);
                    return (
                      <div
                        key={id}
                        className="debate-pre-pill"
                        style={{
                          background: AGENT_BG_TINTS[id] ?? '#FFFFFF',
                          border: `0.5px solid ${agent.color}4D`,
                          animationDelay: `${300 + index * 150}ms`,
                        }}
                      >
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: agent.color, animation: 'breathe 2.4s ease-in-out infinite' }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{agent.name}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#6B6460' }}>Ready</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ margin: '20px 0', width: '100%', height: '0.5px', background: '#E0D8D0' }} />
                <div className="debate-pre-cta">
                  <div style={{ fontSize: '11px', color: '#6B6460', letterSpacing: '.06em', textAlign: 'center', marginBottom: '10px' }}>
                    Ready to see what they think?
                  </div>
                  <button
                    onClick={() => runRound()}
                    className="debate-shimmer-button"
                    style={{
                      width: '100%',
                      maxWidth: '260px',
                      padding: '14px 24px',
                      borderRadius: '999px',
                      background: '#1A1714',
                      color: '#FAF7F4',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 200ms ease',
                      position: 'relative',
                      overflow: 'hidden',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(26,23,20,0.2)';
                      e.currentTarget.style.background = '#2A2724';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.background = '#1A1714';
                    }}
                  >
                    Start the debate
                  </button>
                  <div style={{ fontSize: '11px', color: '#6B6460', textAlign: 'center', marginTop: '8px' }}>
                    Three minds will challenge this view
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div style={{ maxWidth: '680px', margin: '24px auto 0', padding: '0.9rem 1rem', background: '#FFFFFF', border: '0.5px solid rgba(196,149,106,0.3)', borderRadius: '12px' }}>
              <p style={{ fontSize: '13px', color: '#6B6460' }}>{error}</p>
            </div>
          ) : null}
          <div ref={threadEndRef} />
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
            {challengedCard}

            <div className="debate-colosseum-divider" style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '0 auto 32px', maxWidth: '680px' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '4px' }}>
                  The question
                </div>
                <p style={{ fontSize: '13px', color: '#6B6460', fontStyle: 'italic', textAlign: 'center', maxWidth: '360px', lineHeight: 1.5, padding: '0 16px' }}>
                  {originalPrompt}
                </p>
              </div>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
            </div>

            {previousRounds.length > 0 ? (
              <div style={{ maxWidth: '680px', margin: '0 auto 28px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {previousRounds.map((round) => {
                  const expanded = !!expandedRounds[round.roundNumber];
                  return (
                    <div key={round.roundNumber}>
                      <button
                        onClick={() => toggleRound(round.roundNumber)}
                        style={{
                          background: '#F0EBE3',
                          border: '0.5px solid #E0D8D0',
                          borderRadius: '999px',
                          padding: '6px 16px',
                          fontSize: '12px',
                          color: '#6B6460',
                          cursor: 'pointer',
                          transition: 'background 150ms ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#E0D8D0'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#F0EBE3'}
                      >
                        {getRoundSummary(round)}
                      </button>
                      <div className={`debate-history-panel ${expanded ? 'expanded' : ''}`}>
                        <div className="debate-history-panel-inner">
                          {renderRoundSection(round, true)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="debate-colosseum-label" style={{ maxWidth: '680px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              <span style={{ fontSize: '10px', letterSpacing: '.15em', textTransform: 'uppercase', color: '#6B6460', textAlign: 'center' }}>
                How the others react
              </span>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
            </div>

            {latestRound ? renderRoundSection(latestRound, false) : null}

            {phase === 'streaming' ? (
              <div style={{ position: 'relative', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: '28px',
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    background: 'linear-gradient(to bottom, #E0D8D0, transparent)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {reactingIds.map((id, index) => {
                    const text = streamingTexts[id] || '';
                    const isDone = doneAgents.has(id);
                    const reaction: DebateReaction = {
                      agent_id: id,
                      agent_number: reactingIds.indexOf(id) + 1,
                      stance: '',
                      content: '',
                      timestamp: new Date().toISOString(),
                    };
                    return renderReactionCard(reaction, index, 'streaming', text, isDone);
                  })}
                </div>
              </div>
            ) : null}

            {error ? (
              <div style={{ maxWidth: '680px', margin: '24px auto 0', padding: '0.9rem 1rem', background: '#FFFFFF', border: '0.5px solid rgba(196,149,106,0.3)', borderRadius: '12px' }}>
                <p style={{ fontSize: '13px', color: '#6B6460' }}>{error}</p>
              </div>
            ) : null}

            <div ref={threadEndRef} />
          </div>

          <div
            className="debate-action-bar-enter"
            style={{
              position: 'sticky',
              bottom: 0,
              background: 'rgba(250,247,244,0.92)',
              backdropFilter: 'blur(12px)',
              borderTop: '0.5px solid #E0D8D0',
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'center',
              zIndex: 40,
            }}
          >
            {currentRound > 0 && phase !== 'streaming' ? (
          <div style={{ maxWidth: '680px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {canStartNewRound ? (
              <>
                <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={interjection}
                    onChange={(e) => setInterjection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleInterjection();
                      }
                    }}
                    placeholder="Redirect the debate..."
                    style={{
                      width: '100%',
                      background: '#FFFFFF',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: '999px',
                      padding: '12px 18px',
                      fontSize: '14px',
                      color: '#1A1714',
                      outline: 'none',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#C4956A'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#E0D8D0'}
                  />
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      className="debate-action-btn debate-shimmer-button debate-shimmer-button-light"
                      onClick={() => runRound()}
                      style={{
                        minWidth: '280px',
                        padding: '14px 32px',
                        borderRadius: '999px',
                        background: '#F0EBE3',
                        color: '#1A1714',
                        border: '0.5px solid #E0D8D0',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'background 150ms ease, transform 150ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#E0D8D0';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#F0EBE3';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Next round — push further
                    </button>
                    <button
                      className="debate-action-btn"
                      onClick={handleInterjection}
                      disabled={!interjection.trim()}
                      style={{
                        minWidth: '160px',
                        padding: '14px 24px',
                        borderRadius: '999px',
                        background: '#1A1714',
                        color: '#FAF7F4',
                        border: 'none',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: interjection.trim() ? 'pointer' : 'not-allowed',
                        opacity: interjection.trim() ? 1 : 0.4,
                      }}
                    >
                      Send interjection
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="debate-action-btn"
                  onClick={onExit}
                  style={{
                    padding: '14px 24px',
                    borderRadius: '999px',
                    background: '#F0EBE3',
                    color: '#1A1714',
                    border: '0.5px solid #E0D8D0',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Back to Arena
                </button>
                <button
                  className="debate-action-btn"
                  onClick={onExit}
                  style={{
                    padding: '14px 24px',
                    borderRadius: '999px',
                    background: '#1A1714',
                    color: '#FAF7F4',
                    border: 'none',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Ask a follow-up
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#6B6460' }}>The arena is reacting...</div>
        )}
          </div>
        </>
      )}
    </div>
  );
}
