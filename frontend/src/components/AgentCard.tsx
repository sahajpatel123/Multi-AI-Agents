import { useEffect, useRef, useState } from 'react';
import { Trophy, Swords, MessageCircle } from 'lucide-react';
import { ScoredAgent, AGENTS } from '../types';

interface AgentCardProps {
  scoredAgent?: ScoredAgent;
  isExpanded: boolean;
  onToggle: () => void;
  streamingText?: string;
  isStreaming?: boolean;
  agentId: string;
  onChallenge?: () => void;
  onDiscuss?: () => void;
  isIdle?: boolean;
}

export function AgentCard({
  scoredAgent,
  isExpanded,
  onToggle,
  streamingText,
  isStreaming,
  agentId,
  onChallenge,
  onDiscuss,
  isIdle = false,
}: AgentCardProps) {
  const agentConfig = AGENTS[agentId];
  const response = scoredAgent?.response;
  const score = scoredAgent?.score;
  const isWinner = scoredAgent?.is_winner ?? false;

  // Animated confidence bar — starts at 0, animates to final value
  const [barWidth, setBarWidth] = useState(0);
  const prevConfidence = useRef(0);

  useEffect(() => {
    if (response?.confidence != null && response.confidence !== prevConfidence.current) {
      // Small delay so the animation is visible after mount
      const timer = setTimeout(() => setBarWidth(response.confidence), 50);
      prevConfidence.current = response.confidence;
      return () => clearTimeout(timer);
    }
  }, [response?.confidence]);

  // Content height transition ref
  const contentRef = useRef<HTMLDivElement>(null);

  const displayText = isStreaming
    ? streamingText || ''
    : isExpanded
      ? response?.verdict || ''
      : response?.one_liner || '';

  return (
    <div
      className={`
        bg-surface rounded-lg border
        transition-all duration-300 ease-in-out
        ${isIdle ? 'opacity-75 cursor-default' : 'cursor-pointer'}
        ${isWinner
          ? 'border-accent ring-2 ring-accent/20 scale-[1.02]'
          : 'border-border hover:border-text-secondary/30 scale-100'
        }
        ${isExpanded ? 'md:col-span-2' : ''}
      `}
      onClick={isIdle ? undefined : onToggle}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: agentConfig.color }}
            />
            <span className="font-medium text-text-primary">
              {agentConfig.name}
            </span>
            {isWinner && (
              <Trophy className="w-4 h-4 text-accent" />
            )}
            {isStreaming && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: agentConfig.color }}
              />
            )}
          </div>
          {score != null && !isIdle && (
            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <span>Score: {score}</span>
              <span>Confidence: {response?.confidence ?? 0}%</span>
            </div>
          )}
        </div>

        {/* Content with transition */}
        <div
          ref={contentRef}
          className="transition-all duration-300 ease-in-out overflow-hidden"
        >
          {isIdle ? (
            <p className="text-text-secondary text-sm italic">
              {agentConfig.oneLiner || 'Ready to respond...'}
            </p>
          ) : isStreaming ? (
            <p className="text-text-primary leading-relaxed whitespace-pre-wrap">
              {displayText}
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-text-secondary/50 animate-pulse align-text-bottom" />
            </p>
          ) : isExpanded && response ? (
            <div className="space-y-3">
              <p className="text-text-primary leading-relaxed">
                {response.verdict}
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-sm text-text-secondary">
                  <span className="font-medium">Key assumption:</span>{' '}
                  {response.key_assumption}
                </p>
              </div>
              {scoredAgent?.contradiction?.detected && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-text-secondary italic">
                    ⚠ Conflicts with earlier position
                  </p>
                </div>
              )}
              {(onChallenge || onDiscuss) && (
                <div className="flex gap-2 pt-2">
                  {onChallenge && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onChallenge(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                                 bg-background border border-border rounded
                                 text-text-secondary hover:text-text-primary hover:border-accent/50
                                 transition-all duration-300"
                    >
                      <Swords className="w-3 h-3" />
                      Challenge
                    </button>
                  )}
                  {onDiscuss && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDiscuss(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                                 bg-background border border-border rounded
                                 text-text-secondary hover:text-text-primary hover:border-accent/50
                                 transition-all duration-300"
                    >
                      <MessageCircle className="w-3 h-3" />
                      Discuss
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : response ? (
            <p className="text-text-secondary text-sm">
              {response.one_liner}
            </p>
          ) : !isStreaming ? (
            <p className="text-text-secondary/40 text-sm italic">
              Waiting for response...
            </p>
          ) : null}
        </div>
      </div>

      {/* Confidence bar — animated fill (hidden in idle state) */}
      {!isIdle && (
        <div className="h-1 bg-border/30 rounded-b-lg overflow-hidden">
          <div
            className="h-full rounded-b-lg transition-all duration-700 ease-out"
            style={{
              width: `${barWidth}%`,
              backgroundColor: agentConfig.color,
            }}
          />
        </div>
      )}
    </div>
  );
}
