import { useEffect, useRef, useState } from 'react';
import { Trophy, Swords, MessageCircle } from 'lucide-react';
import { ScoredAgent, AGENTS } from '../types';

interface AgentCardProps {
  scoredAgent?: ScoredAgent;
  isExpanded: boolean;
  onToggle: (cardRect?: DOMRect) => void;
  onTitleClick?: () => void;
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
  onTitleClick,
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
  const agentBackgroundGradients: Record<string, string> = {
    agent_1: 'linear-gradient(180deg, #F3F5F7 0%, #EEF0F2 100%)',
    agent_2: 'linear-gradient(180deg, #F4F1F6 0%, #F0EDF2 100%)',
    agent_3: 'linear-gradient(180deg, #F1F6F3 0%, #EDF2EF 100%)',
    agent_4: 'linear-gradient(180deg, #F6F1EC 0%, #F2EDE8 100%)',
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
  const useBottomReplyZone = !isIdle && !isExpanded;

  return (
    <div
      className={`
        rounded-2xl
        cursor-pointer
        ${isWinner
          ? 'ring-2 ring-accent/30 scale-[1.01]'
          : 'scale-100'
        }
        ${isExpanded ? 'md:col-span-2' : ''}
      `}
      style={{
        background: agentBackgroundGradients[agentId] || `linear-gradient(180deg, ${agentBackgrounds[agentId] || '#FAF7F4'} 0%, ${agentBackgrounds[agentId] || '#FAF7F4'} 100%)`,
        boxShadow: isHovered
          ? `0 10px 24px rgba(${hoverRgb}, 0.18), inset 0 1px 0 rgba(255,255,255,0.72)`
          : isWinner
            ? '0 8px 18px rgba(196, 149, 106, 0.18)'
            : '0 4px 14px rgba(26, 23, 20, 0.07)',
        border: isHovered ? '1px solid rgba(255,255,255,0.7)' : `1px solid rgba(${hoverRgb}, 0.16)`,
        transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        backdropFilter: isHovered ? 'blur(8px)' : 'blur(0px)',
        transform: isHovered ? 'translateY(-2px)' : undefined,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '220px'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => onToggle((e.currentTarget as HTMLDivElement).getBoundingClientRect())}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
          background: `linear-gradient(
            145deg,
            rgba(255,255,255,0.24) 0%,
            rgba(255,255,255,0.09) 46%,
            rgba(255,255,255,0.0) 64%,
            rgba(${hoverRgb}, 0.08) 100%
          )`,
        }}
      />
      <div style={{ padding: '28px 32px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: agentConfig.color }}
            />
            {onTitleClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTitleClick();
                }}
                className="font-bold tracking-[0.012em] text-text-primary hover:opacity-80 transition-opacity"
                style={{ fontSize: '1.1rem', textShadow: '0 0.4px 0 rgba(26, 23, 20, 0.45)' }}
              >
                {agentConfig.name}
              </button>
            ) : (
              <span
                className="font-bold tracking-[0.012em] text-text-primary"
                style={{ fontSize: '1.1rem', textShadow: '0 0.4px 0 rgba(26, 23, 20, 0.45)' }}
              >
                {agentConfig.name}
              </span>
            )}
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
            <div className="flex items-center gap-3 text-[12.5px] text-text-secondary/95">
              <span>Score: {score}</span>
              <span>Confidence: {response?.confidence ?? 0}%</span>
            </div>
          )}
        </div>

        {/* Content with transition */}
        <div
          ref={contentRef}
          className="transition-all duration-300 ease-in-out overflow-hidden"
          style={{
            marginTop: useBottomReplyZone ? 'auto' : undefined,
            marginBottom: useBottomReplyZone ? '100px' : undefined,
          }}
        >
          {isIdle ? (
            <p className="text-sm italic" style={{ color: 'rgba(74, 66, 60, 0.9)' }}>
              {agentConfig.oneLiner || 'Ready to respond...'}
            </p>
          ) : isStreaming ? (
            <div className="pt-5 border-t border-border/80">
              <p
                className="text-text-primary leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: '1.12rem', lineHeight: '1.55' }}
              >
                {displayText}
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-text-secondary/50 animate-pulse align-text-bottom" />
              </p>
            </div>
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
                                 bg-background/75 border border-border rounded-md
                                 text-text-secondary hover:text-text-primary hover:border-accent/50
                                 transition-all duration-300 hover:shadow-sm"
                    >
                      <Swords className="w-3 h-3" />
                      Challenge
                    </button>
                  )}
                  {onDiscuss && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDiscuss(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                                 bg-background/75 border border-border rounded-md
                                 text-text-secondary hover:text-text-primary hover:border-accent/50
                                 transition-all duration-300 hover:shadow-sm"
                    >
                      <MessageCircle className="w-3 h-3" />
                      Discuss
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : response ? (
            <div className="pt-5 border-t border-border/80">
              <p
                className="text-text-primary"
                style={{ color: 'rgba(47, 42, 38, 0.95)', fontSize: '1.12rem', lineHeight: '1.55' }}
              >
                {response.one_liner}
              </p>
            </div>
          ) : !isStreaming ? (
            <div className="pt-5 border-t border-border/70">
              <p className="text-sm italic" style={{ color: 'rgba(74, 66, 60, 0.55)' }}>
                Waiting for response...
              </p>
            </div>
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
