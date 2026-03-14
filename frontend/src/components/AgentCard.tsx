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

interface AgentDisplayConfig {
  name: string;
  color: string;
  quote?: string;
  bgTint?: string;
}

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
  displayConfig?: AgentDisplayConfig;
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
  isExpanded: _isExpanded,
  onToggle,
  onTitleClick,
  streamingText,
  isStreaming,
  agentId,
  onChallenge: _onChallenge,
  onDiscuss: _onDiscuss,
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
  shareFeedbackActive: _shareFeedbackActive = false,
  isLoadingState = false,
  animateConfidenceBar = true,
  displayConfig,
}: AgentCardProps) {
  const agentConfig = AGENTS[agentId];
  const resolvedDisplay = {
    name: displayConfig?.name || agentConfig.name,
    color: displayConfig?.color || agentConfig.color,
    quote: displayConfig?.quote || agentConfig.oneLiner,
    bgTint: displayConfig?.bgTint,
  };
  const [isShareDropdownOpen, setIsShareDropdownOpen] = useState(false);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const agentBackgrounds: Record<string, string> = {
    agent_1: resolvedDisplay.bgTint || '#EEF0F2',
    agent_2: resolvedDisplay.bgTint || '#F0EDF2',
    agent_3: resolvedDisplay.bgTint || '#EDF2EF',
    agent_4: resolvedDisplay.bgTint || '#F2EDE8',
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
  const displayText = isStreaming
    ? streamingText || ''
    : response?.one_liner || resolvedDisplay.quote || '';
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
      ref={cardRef}
      style={{
        background: isWinner ? '#FFFCF9' : (isLoadingState ? `linear-gradient(90deg, ${agentBackgrounds[agentId]} 0%, rgba(255,255,255,0.6) 50%, ${agentBackgrounds[agentId]} 100%)` : agentBackgrounds[agentId]),
        backgroundSize: isLoadingState ? '200% 100%' : 'auto',
        animation: isLoadingState ? 'shimmer 1.5s infinite' : (isWinner ? 'winnerPulse 400ms ease-out' : 'none'),
        border: isWinner ? '1px solid #C4956A' : '0.5px solid #E0D8D0',
        borderRadius: '16px',
        boxShadow: isHovered ? '0 8px 24px rgba(26,23,20,0.07)' : (isHighlighted ? '0 12px 30px rgba(196, 149, 106, 0.2)' : 'none'),
        transition: 'all 200ms ease',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '220px',
        cursor: isLoadingState ? 'default' : 'pointer',
        willChange: 'transform',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (isLoadingState) return;
        onToggle((e.currentTarget as HTMLDivElement).getBoundingClientRect());
      }}
    >
      <div style={{ height: '2px', background: resolvedDisplay.color, borderRadius: '999px', width: '100%' }} />
      <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AgentDot agentId={agentId} size={12} flashKey={dotFlashKey} color={resolvedDisplay.color} />
            {onTitleClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTitleClick();
                }}
                style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', background: 'none', border: 'none', cursor: 'pointer', transition: 'opacity 150ms ease' }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                {resolvedDisplay.name}
              </button>
            ) : (
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714' }}>
                {resolvedDisplay.name}
              </span>
            )}
            {isWinner && (
              <Trophy style={{ width: '14px', height: '14px', color: '#C4956A' }} />
            )}
            {isStreaming && (
              <span
                style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: resolvedDisplay.color, animation: 'breathe 2.4s ease-in-out infinite' }}
              />
            )}
          </div>
          {score != null && !isIdle && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#1A1714', background: isWinner ? '#C4956A' : '#F0EBE3', padding: '3px 10px', borderRadius: '999px', fontWeight: isWinner ? 500 : 400 }}>
                {isWinner ? `Winner · ${score}` : score}
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        {!isIdle && <div style={{ height: '0.5px', background: '#E0D8D0', margin: '10px 0' }} />}

        {/* Content with transition */}
        <div
          ref={contentRef}
          style={{
            marginTop: useBottomReplyZone ? 'auto' : undefined,
            overflow: 'hidden',
            transition: 'all 300ms ease-in-out',
          }}
        >
          {isIdle ? (
            <p style={{ fontSize: '13px', color: '#6B6460', fontStyle: 'italic', marginTop: '0.4rem' }}>
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
            <div>
              <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                {displayText}
                <span style={{ display: 'inline-block', width: '2px', height: '16px', marginLeft: '2px', background: 'rgba(107,100,96,0.5)', animation: 'breathe 1.2s ease-in-out infinite', verticalAlign: 'text-bottom' }} />
              </p>
            </div>
          ) : response ? (
            <div>
              <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7' }}>
                {response.one_liner}
              </p>
            </div>
          ) : !isStreaming ? (
            <div>
              <p style={{ fontSize: '13px', color: '#6B6460', fontStyle: 'italic' }}>
                Waiting for response...
              </p>
            </div>
          ) : null}
        </div>

        {response && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: '10px',
              borderTop: '0.5px solid #F0EBE3',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ActionButton
              icon={copyFeedbackActive ? <Check style={{ width: '15px', height: '15px' }} /> : <Copy style={{ width: '15px', height: '15px' }} />}
              onClick={onCopy}
              active={copyFeedbackActive}
              activeColor="#C4956A"
            />
            <ActionButton
              icon={<ThumbsUp style={{ width: '15px', height: '15px', fill: isLiked ? 'currentColor' : 'none' }} />}
              onClick={onLike}
              active={isLiked}
              activeColor="#C4956A"
            />
            <ActionButton
              icon={<ThumbsDown style={{ width: '15px', height: '15px', fill: isDisliked ? 'currentColor' : 'none' }} />}
              onClick={onDislike}
              active={isDisliked}
              activeColor="#6B6460"
            />
            <ActionButton
              ref={shareButtonRef}
              icon={<Share2 style={{ width: '15px', height: '15px' }} />}
              onClick={() => setIsShareDropdownOpen(!isShareDropdownOpen)}
              active={isShareDropdownOpen}
              activeColor="#C4956A"
            />
            <ActionButton
              icon={<Bookmark style={{ width: '15px', height: '15px', fill: isSaved ? 'currentColor' : 'none' }} />}
              onClick={onSave}
              active={isSaved}
              activeColor="#C4956A"
            />
            {!isIdle && (
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#6B6460', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Click</span>
                <span style={{ fontSize: '14px', color: agentConfig.color }}>•</span>
                <span>to go deeper</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confidence bar — animated fill (hidden in idle state) */}
      {!isIdle && (
        <div style={{ height: '2px', background: '#F0EBE3', borderRadius: '999px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              borderRadius: '999px',
              width: `${barWidth}%`,
              backgroundColor: agentConfig.color,
              transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)',
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
  const [isClicked, setIsClicked] = useState(false);

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsClicked(true);
        setTimeout(() => setIsClicked(false), 300);
        onClick?.();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-pressed={active}
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        background: isHovered ? '#F0EBE3' : 'transparent',
        color: active ? activeColor : (isHovered ? '#1A1714' : '#6B6460'),
        transition: 'all 150ms ease',
        transform: isHovered ? 'scale(1.15)' : (isClicked ? 'scale(1.4)' : 'scale(1)'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {icon}
    </button>
  );
};
