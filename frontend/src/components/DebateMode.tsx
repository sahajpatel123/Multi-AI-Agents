import { useCallback, useRef, useState } from 'react';
import { MessageSquare, ArrowLeft, Plus, X } from 'lucide-react';
import { streamDebateRound } from '../api';
import {
  ScoredAgent,
  DebateMessage,
  DebateReaction,
  AGENTS,
} from '../types';
import { AgentDot } from './AgentDot';

interface DebateModeProps {
  originalPrompt: string;
  challengedAgent: ScoredAgent;
  sessionId: string;
  onExit: () => void;
  onSuccess?: () => void;
}

type DebatePhase = 'idle' | 'streaming' | 'done';

interface DebateRound {
  roundNumber: number;
  reactions: DebateReaction[];
  userInterjection?: string;
}

export function DebateMode({
  originalPrompt,
  challengedAgent,
  sessionId,
  onExit,
  onSuccess,
}: DebateModeProps) {
  const [phase, setPhase] = useState<DebatePhase>('idle');
  const [rounds, setRounds] = useState<DebateRound[]>([]);
  const [debateHistory, setDebateHistory] = useState<DebateMessage[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Streaming state per agent
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [doneAgents, setDoneAgents] = useState<Set<string>>(new Set());
  const tokenBuffers = useRef<Record<string, string>>({});
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // User interjection input
  const [interjection, setInterjection] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

  const challengedConfig = AGENTS[challengedAgent.response.agent_id];
  const reactingIds = Object.keys(AGENTS).filter(
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
            
            // Refresh user count after successful debate round
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#FAF7F4' }}>
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
      `}</style>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onExit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#6B6460',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}
        >
          <ArrowLeft style={{ width: '14px', height: '14px' }} />
          Back to Arena
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B6460', background: '#F0EBE3', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '4px 14px' }}>
          <MessageSquare style={{ width: '12px', height: '12px' }} />
          Round {currentRound}/3
        </div>
      </div>

      {/* Challenged agent — full width, accent border */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: `1px solid ${challengedConfig.color}`,
          padding: '1.25rem',
          transition: 'all 200ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
          <AgentDot agentId={challengedAgent.response.agent_id} size={10} />
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714' }}>
            {challengedConfig.name}
          </span>
          <span style={{ fontSize: '11px', color: '#6B6460', background: '#F0EBE3', padding: '2px 8px', borderRadius: '999px' }}>
            challenged
          </span>
        </div>
        <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7' }}>
          {challengedAgent.response.verdict}
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '13px', color: '#6B6460' }}>
          <span style={{ fontWeight: 500 }}>Key assumption:</span>{' '}
          {challengedAgent.response.key_assumption}
        </p>
      </div>

      {/* Original prompt context */}
      <div style={{ padding: '0.75rem', background: 'rgba(240,235,227,0.5)', borderRadius: '10px', border: '0.5px solid #E0D8D0' }}>
        <p style={{ fontSize: '11px', color: '#6B6460', marginBottom: '0.25rem' }}>Original question</p>
        <p style={{ fontSize: '13px', color: '#1A1714' }}>{originalPrompt}</p>
      </div>

      {/* Start debate button (if no rounds yet) */}
      {currentRound === 0 && phase === 'idle' && (
        <button
          onClick={() => runRound()}
          style={{
            width: '100%',
            padding: '12px',
            background: '#1A1714',
            border: 'none',
            borderRadius: '999px',
            color: '#FAF7F4',
            fontSize: '13px',
            fontWeight: 400,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          Start Debate — Let the others react
        </button>
      )}

      {/* Debate thread */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {rounds.map((round) => (
          <div key={round.roundNumber} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Round divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6B6460' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              <span style={{ background: '#F0EBE3', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '4px 14px' }}>Round {round.roundNumber}</span>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
            </div>

            {/* User interjection if present */}
            {round.userInterjection && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '70%', background: '#1A1714', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontSize: '14px', color: '#FAF7F4', lineHeight: '1.7' }}>{round.userInterjection}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(250,247,244,0.5)', marginTop: '4px' }}>You</p>
                </div>
              </div>
            )}

            {/* Agent reactions */}
            {round.reactions.map((reaction) => {
              const agent = AGENTS[reaction.agent_id];
              return (
                <div
                  key={`${round.roundNumber}-${reaction.agent_id}`}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '0.5px solid #E0D8D0',
                    padding: '12px 14px',
                    transition: 'all 200ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AgentDot agentId={reaction.agent_id} size={8} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: agent.color }}>
                      {agent.name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: `${agent.color}15`,
                        color: agent.color,
                      }}
                    >
                      {reaction.stance}
                    </span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7' }}>
                    {reaction.content}
                  </p>
                </div>
              );
            })}
          </div>
        ))}

        {/* Currently streaming reactions */}
        {phase === 'streaming' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6B6460' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              <span style={{ background: '#F0EBE3', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '4px 14px' }}>Round {currentRound + 1}</span>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
            </div>

            {reactingIds.map((id) => {
              const agent = AGENTS[id];
              const text = streamingTexts[id] || '';
              const isDone = doneAgents.has(id);

              return (
                <div
                  key={`streaming-${id}`}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '0.5px solid #E0D8D0',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AgentDot agentId={id} size={8} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: agent.color }}>
                      {agent.name}
                    </span>
                    {!isDone && (
                      <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: agent.color, animation: 'breathe 2.4s ease-in-out infinite' }} />
                    )}
                  </div>
                  {text ? (
                    <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                      {text}
                      {!isDone && (
                        <span style={{ display: 'inline-block', width: '2px', height: '16px', marginLeft: '2px', background: 'rgba(107,100,96,0.5)', animation: 'breathe 1.2s ease-in-out infinite', verticalAlign: 'text-bottom' }} />
                      )}
                    </p>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'rgba(107,100,96,0.4)', fontStyle: 'italic' }}>
                      Thinking...
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '0.75rem', background: '#FFFFFF', border: '0.5px solid rgba(196,149,106,0.3)', borderRadius: '10px' }}>
          <p style={{ fontSize: '13px', color: '#6B6460' }}>{error}</p>
        </div>
      )}

      {/* Bottom controls */}
      {currentRound > 0 && phase !== 'streaming' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* User interjection input */}
          {canStartNewRound && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
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
                  flex: 1,
                  background: '#FFFFFF',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  color: '#1A1714',
                  outline: 'none',
                  transition: 'border-color 200ms ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#C4956A'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E0D8D0'}
              />
              <button
                onClick={handleInterjection}
                disabled={!interjection.trim()}
                style={{
                  padding: '10px 20px',
                  background: '#1A1714',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '13px',
                  color: '#FAF7F4',
                  cursor: interjection.trim() ? 'pointer' : 'not-allowed',
                  opacity: interjection.trim() ? 1 : 0.4,
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (interjection.trim()) e.currentTarget.style.opacity = '0.85';
                }}
                onMouseLeave={(e) => {
                  if (interjection.trim()) e.currentTarget.style.opacity = '1';
                }}
              >
                Send
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {canStartNewRound && (
              <button
                onClick={() => runRound()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: '#F0EBE3',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '999px',
                  fontSize: '13px',
                  color: '#1A1714',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#E0D8D0'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#F0EBE3'}
              >
                <Plus style={{ width: '14px', height: '14px' }} />
                New Round
              </button>
            )}
            <button
              onClick={onExit}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#F0EBE3',
                border: '0.5px solid #E0D8D0',
                borderRadius: '999px',
                fontSize: '13px',
                color: '#6B6460',
                cursor: 'pointer',
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
              <X style={{ width: '14px', height: '14px' }} />
              End Debate
            </button>
            {currentRound >= 3 && (
              <p style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: '#6B6460' }}>
                Maximum rounds reached
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
