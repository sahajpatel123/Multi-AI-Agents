import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Trophy,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Bookmark,
} from 'lucide-react';
import { ScoredAgent, AGENTS } from '../types';
import { AgentDot } from './AgentDot';
import { ShareDropdown } from './ShareDropdown';

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
  dotFlashKey?: number;
  isHighlighted?: boolean;
  cardRef?: (node: HTMLDivElement | null) => void;
  onCopy?: () => void;
  onLike?: () => void;
  onDislike?: () => void;
  onShare?: () => void;
  onSave?: () => void;
  prompt?: string;
  isLiked?: boolean;
  isDisliked?: boolean;
  isSaved?: boolean;
  copyFeedbackActive?: boolean;
  shareFeedbackActive?: boolean;
  isLoadingState?: boolean;
  animateConfidenceBar?: boolean;
}

const THINKING_PHRASES: Record<string, string[]> = {
  agent_1: [
    'Finding the flaw...',
    'Stress testing this...',
    "Looking for what's wrong...",
  ],
  agent_2: [
    'Questioning the premise...',
    'Rethinking from scratch...',
    'Challenging assumptions...',
  ],
  agent_3: [
    'Cutting through the noise...',
    'Finding what actually works...',
    'Getting to the point...',
  ],
  agent_4: [
    'Preparing to disagree...',
    'Finding the other side...',
    'Saying what no one else will...',
  ],
};

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
  dotFlashKey = 0,
  isHighlighted = false,
  cardRef,
  onCopy,
  onLike,
  onDislike,
  onSave,
  prompt = '',
  isLiked = false,
  isDisliked = false,
  isSaved = false,
  copyFeedbackActive = false,
  shareFeedbackActive = false,
  isLoadingState = false,
  animateConfidenceBar = true,
}: AgentCardProps) {
  const agentConfig = AGENTS[agentId];
  const [isShareDropdownOpen, setIsShareDropdownOpen] = useState(false);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
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
  const [thinkingPhraseIndex, setThinkingPhraseIndex] = useState(0);
  const [thinkingPhrasePhase, setThinkingPhrasePhase] = useState<'visible' | 'exiting' | 'entering'>('visible');
  const prevConfidence = useRef(0);

  useEffect(() => {
    if (response?.confidence == null) {
      setBarWidth(0);
      prevConfidence.current = 0;
      return;
    }

    if (!animateConfidenceBar) {
      setBarWidth(response.confidence);
      prevConfidence.current = response.confidence;
      return;
    }

    if (response.confidence !== prevConfidence.current) {
      // Small delay so the animation is visible after mount
      const timer = setTimeout(() => setBarWidth(response.confidence), 50);
      prevConfidence.current = response.confidence;
      return () => clearTimeout(timer);
    }
  }, [animateConfidenceBar, response?.confidence]);

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
    : response?.one_liner || '';
  const showThinkingPhrase = (isLoadingState || (isStreaming && !displayText.trim())) && !response;
  const thinkingPhrases = THINKING_PHRASES[agentId] || ['Thinking...'];
  const useBottomReplyZone = !isIdle;

  useEffect(() => {
    if (!showThinkingPhrase) {
      setThinkingPhrasePhase('visible');
      return;
    }

    let swapTimer: number | undefined;
    let frameId: number | undefined;

    const rotateTimer = window.setTimeout(() => {
      setThinkingPhrasePhase('exiting');
      swapTimer = window.setTimeout(() => {
        setThinkingPhraseIndex((prev) => (prev + 1) % thinkingPhrases.length);
        setThinkingPhrasePhase('entering');
        frameId = requestAnimationFrame(() => {
          setThinkingPhrasePhase('visible');
        });
      }, 300);
    }, 2000);

    return () => {
      window.clearTimeout(rotateTimer);
      if (swapTimer !== undefined) window.clearTimeout(swapTimer);
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [showThinkingPhrase, thinkingPhrases.length, thinkingPhraseIndex]);

  return (
    <div
      className={`
        rounded-2xl
        ${isLoadingState ? 'cursor-default' : 'cursor-pointer'}
        ${isWinner
          ? 'ring-2 ring-accent/30 scale-[1.01]'
          : 'scale-100'
        }
        ${isHighlighted ? 'ring-2 ring-accent/45' : ''}
      `}
      ref={cardRef}
      style={{
        background: isWinner
          ? `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 100%), ${agentBackgroundGradients[agentId] || `linear-gradient(180deg, ${agentBackgrounds[agentId] || '#FAF7F4'} 0%, ${agentBackgrounds[agentId] || '#FAF7F4'} 100%)`}`
          : agentBackgroundGradients[agentId] || `linear-gradient(180deg, ${agentBackgrounds[agentId] || '#FAF7F4'} 0%, ${agentBackgrounds[agentId] || '#FAF7F4'} 100%)`,
        boxShadow: isHovered
          ? `0 10px 24px rgba(${hoverRgb}, 0.18), inset 0 1px 0 rgba(255,255,255,0.72)`
          : isHighlighted
            ? '0 12px 30px rgba(196, 149, 106, 0.2)'
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
      onClick={(e) => {
        if (isLoadingState) return;
        onToggle((e.currentTarget as HTMLDivElement).getBoundingClientRect());
      }}
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
            <AgentDot agentId={agentId} size={12} flashKey={dotFlashKey} />
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
          }}
        >
          {isIdle ? (
            <p className="text-sm italic" style={{ color: 'rgba(74, 66, 60, 0.9)' }}>
              {agentConfig.oneLiner || 'Ready to respond...'}
            </p>
          ) : showThinkingPhrase ? (
            <div
              style={{
                flex: 1,
                minHeight: '132px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  color: '#6B6460',
                  fontStyle: 'italic',
                  fontSize: '13px',
                  opacity: thinkingPhrasePhase === 'exiting' ? 0 : 1,
                  transform:
                    thinkingPhrasePhase === 'exiting'
                      ? 'translateY(-6px)'
                      : thinkingPhrasePhase === 'entering'
                        ? 'translateY(6px)'
                        : 'translateY(0)',
                  transition: 'opacity 300ms ease, transform 300ms ease',
                }}
              >
                {thinkingPhrases[thinkingPhraseIndex]}
              </p>
            </div>
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

        {response && (
          <div
            className="flex items-center gap-1.5"
            style={{
              marginTop: 'auto',
              paddingTop: '10px',
              borderTop: '1px solid #E0D8D0',
            }}
          >
            <ActionButton
              icon={copyFeedbackActive ? <Check className="w-[15px] h-[15px]" /> : <Copy className="w-[15px] h-[15px]" />}
              onClick={onCopy}
              active={copyFeedbackActive}
              activeColor="#C4956A"
            />
            <ActionButton
              icon={<ThumbsUp className="w-[15px] h-[15px]" style={isLiked ? { fill: 'currentColor' } : undefined} />}
              onClick={onLike}
              active={isLiked}
              activeColor="#C4956A"
            />
            <ActionButton
              icon={<ThumbsDown className="w-[15px] h-[15px]" style={isDisliked ? { fill: 'currentColor' } : undefined} />}
              onClick={onDislike}
              active={isDisliked}
              activeColor="#6B6460"
            />
            <ActionButton
              ref={shareButtonRef}
              icon={<Share2 className="w-[15px] h-[15px]" />}
              onClick={() => setIsShareDropdownOpen(!isShareDropdownOpen)}
              active={isShareDropdownOpen}
              activeColor="#C4956A"
            />
            <ActionButton
              icon={<Bookmark className="w-[15px] h-[15px]" style={isSaved ? { fill: 'currentColor' } : undefined} />}
              onClick={onSave}
              active={isSaved}
              activeColor="#C4956A"
            />
          </div>
        )}
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

      {response && (
        <ShareDropdown
          agentId={agentId}
          agentName={agentConfig.name}
          oneLiner={response.one_liner}
          prompt={prompt}
          isOpen={isShareDropdownOpen}
          onClose={() => setIsShareDropdownOpen(false)}
          anchorRef={shareButtonRef}
        />
      )}
    </div>
  );
}

interface ActionButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  ref?: React.RefObject<HTMLButtonElement>;
}

const ActionButton = ({ icon, onClick, active = false, activeColor = '#1A1714', ref }: ActionButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-pressed={active}
      className="flex items-center justify-center"
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        background: isHovered ? '#F0EBE3' : 'transparent',
        color: active ? activeColor : (isHovered ? '#1A1714' : '#6B6460'),
        transition: 'all 150ms ease',
      }}
    >
      {icon}
    </button>
  );
};
