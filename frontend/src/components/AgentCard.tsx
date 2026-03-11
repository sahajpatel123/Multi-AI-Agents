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
  const agentBackgrounds: Record<string, string> = {
    agent_1: '#EEF0F2',
    agent_2: '#F0EDF2',
    agent_3: '#EDF2EF',
    agent_4: '#F2EDE8',
  };
  const response = scoredAgent?.response;
  const score = scoredAgent?.score;
  const isWinner = scoredAgent?.is_winner ?? false;

  // Animated confidence bar — starts at 0, animates to final value
  const [barWidth, setBarWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
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
  const agentRgb: Record<string, string> = {
    agent_1: '140, 155, 171',
    agent_2: '155, 143, 170',
    agent_3: '138, 168, 153',
    agent_4: '176, 151, 126',
  };
  const hoverRgb = agentRgb[agentId] || '26, 23, 20';

  const displayText = isStreaming
    ? streamingText || ''
    : isExpanded
      ? response?.verdict || ''
      : response?.one_liner || '';

  return (
    <div
      className={`
        rounded-2xl
        ${isIdle ? 'opacity-75 cursor-default' : 'cursor-pointer'}
        ${isWinner
          ? 'ring-2 ring-accent/30 scale-[1.02]'
          : 'scale-100'
        }
        ${isExpanded ? 'md:col-span-2' : ''}
      `}
      style={{
        backgroundColor: agentBackgrounds[agentId] || '#FAF7F4',
        boxShadow: isHovered
          ? `0 12px 40px rgba(${hoverRgb}, 0.25), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.3)`
          : isWinner
            ? '0 4px 20px rgba(196, 149, 106, 0.25)'
            : '0 2px 12px rgba(26, 23, 20, 0.06)',
        border: isHovered ? '1px solid rgba(255,255,255,0.7)' : '1px solid transparent',
        transition: 'all 0.4s ease',
        backdropFilter: isHovered ? 'blur(20px)' : 'blur(0px)',
        transform: isHovered ? 'translateY(-4px)' : undefined,
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        minHeight: '200px'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={isIdle ? undefined : onToggle}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'none',
          background: `linear-gradient(
            135deg,
            rgba(255,255,255,0.45) 0%,
            rgba(255,255,255,0.15) 40%,
            rgba(255,255,255,0.0) 60%,
            rgba(${hoverRgb}, 0.15) 100%
          )`,
        }}
      />
      <div style={{ padding: '28px 32px' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: agentConfig.color }}
            />
            <span
              className="font-bold tracking-[0.012em] text-text-primary"
              style={{ fontSize: '1.30rem', textShadow: '0 0.5px 0 rgba(26, 23, 20, 0.5)' }}
            >
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
