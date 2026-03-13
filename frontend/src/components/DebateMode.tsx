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
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Arena
        </button>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <MessageSquare className="w-4 h-4" />
          Debate Mode — Round {currentRound}/{3}
        </div>
      </div>

      {/* Challenged agent — full width, accent border */}
      <div
        className="bg-surface rounded-lg border-2 p-5 transition-all duration-300"
        style={{ borderColor: challengedConfig.color }}
      >
        <div className="flex items-center gap-2 mb-3">
          <AgentDot agentId={challengedAgent.response.agent_id} size={12} />
          <span className="font-medium text-text-primary">
            {challengedConfig.name}
          </span>
          <span className="text-xs text-text-secondary bg-border/50 px-2 py-0.5 rounded">
            challenged
          </span>
        </div>
        <p className="text-text-primary leading-relaxed">
          {challengedAgent.response.verdict}
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          <span className="font-medium">Key assumption:</span>{' '}
          {challengedAgent.response.key_assumption}
        </p>
      </div>

      {/* Original prompt context */}
      <div className="p-3 bg-surface/50 rounded-lg border border-border">
        <p className="text-xs text-text-secondary mb-1">Original question</p>
        <p className="text-sm text-text-primary">{originalPrompt}</p>
      </div>

      {/* Start debate button (if no rounds yet) */}
      {currentRound === 0 && phase === 'idle' && (
        <button
          onClick={() => runRound()}
          className="w-full py-3 bg-surface border border-border rounded-lg text-text-primary
                     hover:border-accent/50 transition-all duration-300 text-sm font-medium"
        >
          Start Debate — Let the others react
        </button>
      )}

      {/* Debate thread */}
      <div className="space-y-4">
        {rounds.map((round) => (
          <div key={round.roundNumber} className="space-y-3">
            {/* Round divider */}
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <div className="flex-1 h-px bg-border" />
              <span>Round {round.roundNumber}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* User interjection if present */}
            {round.userInterjection && (
              <div className="flex justify-end">
                <div className="max-w-[70%] bg-accent/10 border border-accent/20 rounded-lg px-4 py-2">
                  <p className="text-sm text-text-primary">{round.userInterjection}</p>
                  <p className="text-xs text-text-secondary mt-1">You</p>
                </div>
              </div>
            )}

            {/* Agent reactions */}
            {round.reactions.map((reaction) => {
              const agent = AGENTS[reaction.agent_id];
              return (
                <div
                  key={`${round.roundNumber}-${reaction.agent_id}`}
                  className="bg-surface rounded-lg border border-border p-4 transition-all duration-300"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AgentDot agentId={reaction.agent_id} size={10} />
                    <span className="text-sm font-medium text-text-primary">
                      {agent.name}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: `${agent.color}15`,
                        color: agent.color,
                      }}
                    >
                      {reaction.stance}
                    </span>
                  </div>
                  <p className="text-text-primary text-sm leading-relaxed">
                    {reaction.content}
                  </p>
                </div>
              );
            })}
          </div>
        ))}

        {/* Currently streaming reactions */}
        {phase === 'streaming' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <div className="flex-1 h-px bg-border" />
              <span>Round {currentRound + 1}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {reactingIds.map((id) => {
              const agent = AGENTS[id];
              const text = streamingTexts[id] || '';
              const isDone = doneAgents.has(id);

              return (
                <div
                  key={`streaming-${id}`}
                  className="bg-surface rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AgentDot agentId={id} size={10} />
                    <span className="text-sm font-medium text-text-primary">
                      {agent.name}
                    </span>
                    {!isDone && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: agent.color }}
                      />
                    )}
                  </div>
                  {text ? (
                    <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">
                      {text}
                      {!isDone && (
                        <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-text-secondary/50 animate-pulse align-text-bottom" />
                      )}
                    </p>
                  ) : (
                    <p className="text-text-secondary/40 text-sm italic">
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
        <div className="p-3 bg-surface border border-accent/30 rounded-lg">
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      )}

      {/* Bottom controls */}
      {currentRound > 0 && phase !== 'streaming' && (
        <div className="space-y-3">
          {/* User interjection input */}
          {canStartNewRound && (
            <div className="flex gap-2">
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
                className="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-sm
                           text-text-primary placeholder:text-text-secondary/50
                           focus:outline-none focus:border-accent/50 transition-colors duration-300"
              />
              <button
                onClick={handleInterjection}
                disabled={!interjection.trim()}
                className="px-4 py-2.5 bg-surface border border-border rounded-lg text-sm
                           text-text-primary hover:border-accent/50
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all duration-300"
              >
                Send
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {canStartNewRound && (
              <button
                onClick={() => runRound()}
                className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-lg
                           text-sm text-text-primary hover:border-accent/50 transition-all duration-300"
              >
                <Plus className="w-3.5 h-3.5" />
                New Round
              </button>
            )}
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-lg
                         text-sm text-text-secondary hover:text-text-primary transition-all duration-300"
            >
              <X className="w-3.5 h-3.5" />
              End Debate
            </button>
            {currentRound >= 3 && (
              <p className="flex items-center text-xs text-text-secondary">
                Maximum rounds reached
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
