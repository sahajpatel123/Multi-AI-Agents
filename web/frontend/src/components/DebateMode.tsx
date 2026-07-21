import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ArrowLeft } from 'lucide-react';
import { streamDebateRound } from '../api';
import {
  ScoredAgent,
  DebateMessage,
  DebateReaction,
  AGENTS,
} from '../types';
import { AgentAnswerMarkdown } from './AgentAnswerMarkdown';
import { AgentDot } from './AgentDot';
import { MotionButton } from './MotionButton';
import { usePanel } from '../context/PanelContext';
import {
  canOfferDebateFollowUp,
  canStartDebateRound,
  debateMaxRounds,
  DEBATE_BONUS_ROUNDS,
  DEBATE_STANDARD_ROUNDS,
} from '../lib/debateRounds';
import {
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
  DEBATE_INTERJECTION_MAX_CHARS,
} from '../lib/charBudget';
import { useBusyDocumentTitle } from '../hooks/useBusyDocumentTitle';
import { useBusyNavigationGuard } from '../hooks/useBusyNavigationGuard';
import { debateWorkInFlight } from '../lib/busyNavigationGuard';
import { titleForArenaBusy } from '../lib/documentTitle';
import { motionDuration, prefersReducedMotion, scrollBehavior } from '../lib/motion';
import { isScrollNearBottom, shouldAutoScrollChat } from '../lib/chatScroll';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import {
  formatDebateChallengedCopy,
  formatDebateExport,
  formatDebateInterjectionCopy,
  formatDebateReactionCopy,
} from '../lib/threadExport';
import { isBareEndKey, isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';

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
  const abortRef = useRef<AbortController | null>(null);
  const roundInFlightRef = useRef(false);

  const [interjection, setInterjection] = useState('');
  /** After round 3, user may unlock one bonus follow-up round (max 4). */
  const [followUpUnlocked, setFollowUpUnlocked] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadFeedback, setDownloadFeedback] = useState<'idle' | 'done' | 'failed'>('idle');
  /** Which debate piece last copied: 'challenged' | `r{n}-you` | `r{n}-{agentId}` */
  const [pieceCopyKey, setPieceCopyKey] = useState<string | null>(null);
  const [pieceCopyStatus, setPieceCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_ROUNDS = debateMaxRounds(followUpUnlocked);
  const debateBusy = debateWorkInFlight(phase);
  useBusyNavigationGuard(debateBusy);
  useBusyDocumentTitle(debateBusy, titleForArenaBusy('debate'), '/app');

  useEffect(() => {
    if (copyFeedback === 'idle') return;
    const t = window.setTimeout(() => setCopyFeedback('idle'), 1600);
    return () => window.clearTimeout(t);
  }, [copyFeedback]);

  useEffect(() => {
    if (downloadFeedback === 'idle') return;
    const t = window.setTimeout(() => setDownloadFeedback('idle'), 1600);
    return () => window.clearTimeout(t);
  }, [downloadFeedback]);

  useEffect(() => {
    if (pieceCopyStatus === 'idle') return;
    const hold = motionDuration(pieceCopyStatus === 'copied' ? 1600 : 2400);
    const t = window.setTimeout(() => {
      setPieceCopyStatus('idle');
      setPieceCopyKey(null);
    }, hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [pieceCopyStatus]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  const reducedMotion = prefersReducedMotion();
  const challengedConfig = getAgentDisplay(challengedAgent.response.agent_id);
  const reactingIds = AGENT_SLOT_IDS.filter(
    (id) => id !== challengedAgent.response.agent_id
  );

  const buildDebateMarkdown = () =>
    formatDebateExport({
      originalPrompt,
      challengedAgentName: challengedConfig.name,
      challengedOneLiner: challengedAgent.response.one_liner,
      rounds: rounds.map((round) => ({
        roundNumber: round.roundNumber,
        userInterjection: round.userInterjection,
        reactions: round.reactions.map((r) => ({
          agentName: getAgentDisplay(r.agent_id).name,
          content: r.content,
          stance: r.stance,
        })),
      })),
    });

  const handleCopyDebate = async () => {
    const md = buildDebateMarkdown();
    const ok = await copyToClipboard(md);
    setCopyFeedback(ok ? 'copied' : 'failed');
  };

  const handleDownloadDebate = () => {
    const md = buildDebateMarkdown();
    const stem = `debate-${challengedConfig.name || 'transcript'}`;
    const ok = downloadMarkdownFile(md, stem);
    setDownloadFeedback(ok ? 'done' : 'failed');
  };

  const copyDebatePiece = async (key: string, text: string) => {
    if (!text.trim()) {
      setPieceCopyKey(key);
      setPieceCopyStatus('failed');
      return;
    }
    const ok = await copyToClipboard(text);
    setPieceCopyKey(key);
    setPieceCopyStatus(ok ? 'copied' : 'failed');
  };

  const pieceCopyButton = (
    key: string,
    text: string,
    opts: { title: string; ariaLabel: string; dark?: boolean },
  ) => {
    const active = pieceCopyKey === key;
    const label =
      active && pieceCopyStatus === 'copied'
        ? 'Copied'
        : active && pieceCopyStatus === 'failed'
          ? 'Failed'
          : 'Copy';
    return (
      <button
        type="button"
        onClick={() => void copyDebatePiece(key, text)}
        title={opts.title}
        aria-label={opts.ariaLabel}
        style={{
          marginTop: 8,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--vp-font-sans)',
          color: opts.dark
            ? active && pieceCopyStatus === 'failed'
              ? '#F5A89A'
              : active && pieceCopyStatus === 'copied'
                ? '#A8D5B5'
                : 'rgba(250,247,244,0.72)'
            : active && pieceCopyStatus === 'failed'
              ? '#993C1D'
              : active && pieceCopyStatus === 'copied'
                ? '#5A8A5A'
                : '#F0B84E',
        }}
      >
        {label}
      </button>
    );
  };

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

  const syncScrollFlags = useCallback(() => {
    const el = threadScrollRef.current;
    const near = isScrollNearBottom(el);
    stickToBottomRef.current = near;
    setShowJumpLatest(!near);
  }, []);

  const scrollToBottom = useCallback((opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    if (!force && !shouldAutoScrollChat({ stickToBottom: stickToBottomRef.current })) {
      setShowJumpLatest(true);
      return;
    }
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    setTimeout(() => {
      threadEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
      // Re-sync after layout so the jump chip hides reliably.
      requestAnimationFrame(() => {
        stickToBottomRef.current = true;
        setShowJumpLatest(false);
      });
    }, 100);
  }, []);

  const jumpToLatest = useCallback(() => {
    scrollToBottom({ force: true });
  }, [scrollToBottom]);

  // `/` focuses interjection compose; End jumps to latest; Escape returns to Arena.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        e.preventDefault();
        abortRef.current?.abort();
        onExit();
        return;
      }
      if (isBareEndKey(e) && shouldCaptureSlashFocus(e.target)) {
        e.preventDefault();
        jumpToLatest();
        return;
      }
      if (!isBareSlashKey(e) || !shouldCaptureSlashFocus(e.target)) return;
      if (phase === 'streaming') return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, jumpToLatest, onExit]);

  // Follow the live end of the thread only while the reader is stuck to bottom.
  useEffect(() => {
    if (phase !== 'streaming') return;
    if (!shouldAutoScrollChat({ stickToBottom: stickToBottomRef.current })) {
      setShowJumpLatest(true);
      return;
    }
    scrollToBottom();
  }, [streamingTexts, phase, scrollToBottom]);

  const runRound = async (userMessage?: string) => {
    const nextRound = currentRound + 1;
    if (nextRound > MAX_ROUNDS) return;
    if (roundInFlightRef.current) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    roundInFlightRef.current = true;

    setPhase('streaming');
    setError(null);
    setStreamingTexts({});
    setDoneAgents(new Set());
    tokenBuffers.current = {};

    if (flushTimer.current) clearInterval(flushTimer.current);
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
            if (abortController.signal.aborted) return;
            tokenBuffers.current[data.agent_id] =
              (tokenBuffers.current[data.agent_id] || '') + data.token;
          },
          onReactionDone: (data) => {
            if (abortController.signal.aborted) return;
            setDoneAgents((prev) => new Set(prev).add(data.agent_id));
            scrollToBottom();
          },
          onResult: (data) => {
            if (abortController.signal.aborted) return;
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
            if (abortController.signal.aborted) return;
            if (flushTimer.current) clearInterval(flushTimer.current);
            setError(data.detail);
            setPhase('done');
          },
        },
        abortController.signal,
      );
    } catch (err) {
      if (flushTimer.current) clearInterval(flushTimer.current);
      if (abortController.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Debate round failed');
      setPhase('done');
    } finally {
      if (abortRef.current === abortController) {
        roundInFlightRef.current = false;
      }
    }
  };

  const handleInterjection = () => {
    const msg = interjection.trim();
    if (!msg) return;
    setInterjection('');
    runRound(msg);
  };

  const canStartNewRound = canStartDebateRound(
    currentRound,
    followUpUnlocked,
    phase === 'streaming',
  );
  const canOfferFollowUp = canOfferDebateFollowUp(
    currentRound,
    followUpUnlocked,
    phase === 'streaming',
  );
  const previousRounds = rounds.slice(0, -1);
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const isPreDebate = currentRound === 0 && phase === 'idle';
  const displayRoundCap = MAX_ROUNDS;
  const displayRoundDots = Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1);

  // Reset stick-to-bottom whenever we land on the post-debate thread.
  useEffect(() => {
    if (isPreDebate) return;
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    scrollToBottom({ force: true });
  }, [isPreDebate, scrollToBottom]);

  const toggleRound = (roundNumber: number) => {
    setExpandedRounds((prev) => ({ ...prev, [roundNumber]: !prev[roundNumber] }));
  };

  const renderReactionCard = (
    reaction: DebateReaction,
    index: number,
    cardType: 'history' | 'current' | 'streaming',
    text?: string,
    isDone?: boolean,
    roundNumber?: number,
  ) => {
    const agent = getAgentDisplay(reaction.agent_id);
    const content = text ?? reaction.content;
    const isStreaming = cardType === 'streaming';
    const copyKey = `r${roundNumber ?? 0}-${cardType}-${reaction.agent_id}-${index}`;
    const canCopy = Boolean((content || '').trim()) && (!isStreaming || isDone);

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
            border: '2px solid #0B0C0A',
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
          className="debate-reaction-card"
          style={
            {
              ['--debate-agent-color' as string]: agent.color,
            } as CSSProperties
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <AgentDot agentId={reaction.agent_id} size={7} />
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>
              {agent.name}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--vp-muted)', letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 500 }}>
              Reaction {index + 1}
            </span>
          </div>
          {content ? (
            <div>
              <AgentAnswerMarkdown markdown={content} question={originalPrompt} />
              {isStreaming && !isDone ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '16px',
                    marginTop: 4,
                    background: 'rgba(107,100,96,0.45)',
                    animation: reducedMotion ? 'none' : 'breathe 1.2s ease-in-out infinite',
                    verticalAlign: 'text-bottom',
                  }}
                />
              ) : null}
              {canCopy
                ? pieceCopyButton(
                    copyKey,
                    formatDebateReactionCopy({
                      agentName: agent.name,
                      content,
                      stance: reaction.stance,
                      originalPrompt,
                      roundNumber,
                      includeQuestion: true,
                    }),
                    {
                      title: `Copy ${agent.name}'s reaction`,
                      ariaLabel: `Copy ${agent.name}'s debate reaction`,
                    },
                  )
                : null}
            </div>
          ) : (
            <div
              style={{ fontSize: '20px', letterSpacing: '4px', color: agent.color }}
              className={reducedMotion ? undefined : 'debate-thinking-pulse'}
              role="status"
              aria-live="polite"
            >
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
            <p style={{ fontSize: '14px', color: '#F3F0E7', lineHeight: 1.7 }}>{round.userInterjection}</p>
            <p style={{ fontSize: '11px', color: 'rgba(250,247,244,0.5)', marginTop: '4px' }}>You</p>
            {pieceCopyButton(
              `r${round.roundNumber}-you`,
              formatDebateInterjectionCopy({
                content: round.userInterjection,
                roundNumber: round.roundNumber,
              }),
              {
                title: 'Copy your interjection',
                ariaLabel: 'Copy your debate interjection',
                dark: true,
              },
            )}
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
          {round.reactions.map((reaction, index) =>
            renderReactionCard(
              reaction,
              index,
              isHistory ? 'history' : 'current',
              undefined,
              undefined,
              round.roundNumber,
            ),
          )}
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
            <div
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: challengedConfig.color,
                animation: reducedMotion ? 'none' : 'breathe 2.4s ease-in-out infinite',
              }}
            />
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
          <span style={{ fontSize: '12px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--vp-muted)', fontWeight: 500 }}>
            In the arena
          </span>
        </div>
        <div style={{ height: '0.5px', background: '#F0EBE3', margin: '14px 0' }} />
        <AgentAnswerMarkdown
          markdown={challengedAgent.response.verdict || challengedAgent.response.one_liner || ''}
          question={originalPrompt}
        />
        <div
          style={{
            marginTop: '14px',
            padding: '12px 14px',
            background: '#0B0C0A',
            borderRadius: '10px',
            borderLeft: `2px solid ${challengedConfig.color}`,
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--vp-muted)', marginBottom: '4px', fontWeight: 500 }}>
            Key assumption
          </div>
          <p style={{ fontSize: '13px', color: '#A0A39A', lineHeight: 1.6, fontStyle: 'italic' }}>
            {challengedAgent.response.key_assumption}
          </p>
        </div>
        {pieceCopyButton(
          'challenged',
          formatDebateChallengedCopy({
            agentName: challengedConfig.name,
            content: challengedAgent.response.verdict || '',
            oneLiner: challengedAgent.response.one_liner,
            keyAssumption: challengedAgent.response.key_assumption,
            originalPrompt,
            includeQuestion: true,
          }),
          {
            title: `Copy ${challengedConfig.name}'s challenged take`,
            ariaLabel: `Copy ${challengedConfig.name}'s challenged debate take`,
          },
        )}
      </div>
    </div>
  );

  return (
    <div className="debate-layout" style={{ minHeight: '100vh', background: '#0B0C0A', position: 'relative', display: 'flex', flexDirection: 'column' }}>
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
          background: 'rgba(245, 240, 232, 0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: 'none',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '0 24px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onExit();
            }}
            className="debate-back-btn"
          >
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Back to Arena
          </button>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#F0B84E',
              animation: reducedMotion ? 'none' : 'breathe 2.4s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              void handleCopyDebate();
            }}
            disabled={phase === 'streaming' || rounds.length === 0}
            title={
              rounds.length === 0
                ? 'Start a debate round to copy the transcript'
                : 'Copy debate transcript as markdown'
            }
            style={{
              fontSize: 12,
              color:
                copyFeedback === 'failed'
                  ? '#993C1D'
                  : copyFeedback === 'copied'
                    ? '#5A8C6A'
                    : phase === 'streaming' || rounds.length === 0
                      ? '#A0A39A'
                      : '#F0B84E',
              background: 'none',
              border: '0.5px solid #E0D8D0',
              borderRadius: 999,
              padding: '4px 10px',
              cursor:
                phase === 'streaming' || rounds.length === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--vp-font-sans)',
              whiteSpace: 'nowrap',
            }}
          >
            {copyFeedback === 'copied'
              ? 'Copied'
              : copyFeedback === 'failed'
                ? 'Copy failed'
                : 'Copy debate'}
          </button>
          <button
            type="button"
            onClick={() => handleDownloadDebate()}
            disabled={phase === 'streaming' || rounds.length === 0}
            title={
              rounds.length === 0
                ? 'Start a debate round to download the transcript'
                : 'Download debate transcript as markdown'
            }
            style={{
              fontSize: 12,
              color:
                downloadFeedback === 'failed'
                  ? '#993C1D'
                  : downloadFeedback === 'done'
                    ? '#5A8C6A'
                    : phase === 'streaming' || rounds.length === 0
                      ? '#A0A39A'
                      : '#F0B84E',
              background: 'none',
              border: '0.5px solid #E0D8D0',
              borderRadius: 999,
              padding: '4px 10px',
              cursor:
                phase === 'streaming' || rounds.length === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--vp-font-sans)',
              whiteSpace: 'nowrap',
            }}
          >
            {downloadFeedback === 'done'
              ? 'Downloaded'
              : downloadFeedback === 'failed'
                ? 'Download failed'
                : 'Download .md'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '96px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#A0A39A', letterSpacing: '.08em', textTransform: 'uppercase', marginRight: '4px' }}>Round</span>
              <span style={{ fontSize: '18px', fontWeight: 500, color: '#1A1714' }}>{Math.max(currentRound, phase === 'streaming' ? currentRound + 1 : currentRound || 1)}</span>
              <span style={{ color: '#A0A39A' }}>/</span>
              <span style={{ fontSize: '14px', color: '#A0A39A' }}>{displayRoundCap}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {displayRoundDots.map((dot) => {
                const activeRound = Math.max(currentRound, phase === 'streaming' ? currentRound + 1 : currentRound || 1);
                const state = dot < activeRound ? 'done' : dot === activeRound ? 'active' : 'upcoming';
                return (
                  <div
                    key={dot}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: state === 'active' ? '#F0B84E' : state === 'done' ? 'rgba(26,23,20,0.3)' : 'transparent',
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
              <p style={{ fontSize: '13px', color: '#A0A39A', fontStyle: 'italic', marginTop: '16px', padding: '12px 0', lineHeight: 1.5, maxWidth: '680px' }}>
                {originalPrompt}
              </p>
            </div>

            <div className="debate-pre-action-column">
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#A0A39A', marginBottom: '12px' }}>
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
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: agent.color,
                            animation: reducedMotion ? 'none' : 'breathe 2.4s ease-in-out infinite',
                          }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{agent.name}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#A0A39A' }}>Ready</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ margin: '20px 0', width: '100%', height: '0.5px', background: '#E0D8D0' }} />
                <div className="debate-pre-cta">
                  <div style={{ fontSize: '11px', color: '#A0A39A', letterSpacing: '.06em', textAlign: 'center', marginBottom: '10px' }}>
                    Ready to see what they think?
                  </div>
                  <button
                    onClick={() => runRound()}
                    className="debate-shimmer-button debate-start-btn"
                  >
                    Start the debate
                  </button>
                  <div style={{ fontSize: '11px', color: '#A0A39A', textAlign: 'center', marginTop: '8px' }}>
                    Three minds will challenge this view
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                maxWidth: '680px',
                margin: '24px auto 0',
                padding: '0.9rem 1rem',
                background: '#FFFFFF',
                border: '0.5px solid rgba(196,149,106,0.3)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <p style={{ fontSize: '13px', color: '#A0A39A', margin: 0, flex: 1, lineHeight: 1.45 }}>{error}</p>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  color: '#A0A39A',
                  lineHeight: 1,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ) : null}
          <div ref={threadEndRef} />
        </div>
      ) : (
        <>
          <div
            ref={threadScrollRef}
            onScroll={syncScrollFlags}
            style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}
          >
            {challengedCard}

            <div className="debate-colosseum-divider" style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '0 auto 32px', maxWidth: '680px' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#A0A39A', marginBottom: '4px' }}>
                  The question
                </div>
                <p style={{ fontSize: '13px', color: '#A0A39A', fontStyle: 'italic', textAlign: 'center', maxWidth: '360px', lineHeight: 1.5, padding: '0 16px' }}>
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
                        type="button"
                        onClick={() => toggleRound(round.roundNumber)}
                        className="debate-round-chip"
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
              <span style={{ fontSize: '10px', letterSpacing: '.15em', textTransform: 'uppercase', color: '#A0A39A', textAlign: 'center' }}>
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
                    return renderReactionCard(
                      reaction,
                      index,
                      'streaming',
                      text,
                      isDone,
                      Math.max(currentRound + 1, 1),
                    );
                  })}
                </div>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                style={{
                  maxWidth: '680px',
                  margin: '24px auto 0',
                  padding: '0.9rem 1rem',
                  background: '#FFFFFF',
                  border: '0.5px solid rgba(196,149,106,0.3)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <p style={{ fontSize: '13px', color: '#A0A39A', margin: 0, flex: 1, lineHeight: 1.45 }}>{error}</p>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setError(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    color: '#A0A39A',
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}

            <div ref={threadEndRef} />
          </div>

          {showJumpLatest ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 8,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <button
                type="button"
                onClick={jumpToLatest}
                style={{
                  pointerEvents: 'auto',
                  fontSize: 12,
                  fontFamily: 'var(--vp-font-sans)',
                  color: '#FAF7F2',
                  background: '#F0B84E',
                  border: 'none',
                  borderRadius: 999,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(44,24,16,0.14)',
                }}
              >
                {phase === 'streaming' ? 'Jump to latest · streaming' : 'Jump to latest'}
              </button>
            </div>
          ) : null}

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
            {canOfferFollowUp ? (
              <div
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  background: '#FFFFFF',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 14,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#A0A39A',
                    textAlign: 'center',
                    lineHeight: 1.55,
                    fontFamily: 'var(--vp-font-sans)',
                  }}
                >
                  Three rounds in. Want one optional bonus round to finish the thread?
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <MotionButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setFollowUpUnlocked(true);
                      window.setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  >
                    Unlock bonus round
                  </MotionButton>
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--sm"
                    onClick={() => {
                      abortRef.current?.abort();
                      onExit();
                    }}
                  >
                    End debate
                  </button>
                </div>
              </div>
            ) : null}
            {canStartNewRound ? (
              <>
                <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    id="debate-prompt"
                    ref={inputRef}
                    type="text"
                    value={interjection}
                    maxLength={DEBATE_INTERJECTION_MAX_CHARS}
                    onChange={(e) =>
                      setInterjection(clampToMax(e.target.value, DEBATE_INTERJECTION_MAX_CHARS))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleInterjection();
                      }
                    }}
                    aria-label="Debate interjection"
                    title="Press / to focus · Enter to send"
                    placeholder={
                      followUpUnlocked && currentRound === DEBATE_STANDARD_ROUNDS
                        ? 'Final redirect for the bonus round...'
                        : 'Redirect the debate...'
                    }
                    aria-describedby="debate-interjection-budget"
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
                    onFocus={(e) => e.currentTarget.style.borderColor = '#F0B84E'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#E0D8D0'}
                  />
                  <span
                    id="debate-interjection-budget"
                    title="Character budget (server max 2000)"
                    style={{
                      alignSelf: 'flex-end',
                      fontSize: 11,
                      color:
                        charBudgetTone(interjection.length, DEBATE_INTERJECTION_MAX_CHARS) === 'danger'
                          ? '#D85A30'
                          : charBudgetTone(interjection.length, DEBATE_INTERJECTION_MAX_CHARS) === 'warn'
                            ? '#F0B84E'
                            : '#A0A39A',
                    }}
                  >
                    {charBudgetLabel(interjection.length, DEBATE_INTERJECTION_MAX_CHARS)}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="debate-action-btn debate-shimmer-button debate-shimmer-button-light debate-next-btn"
                      onClick={() => runRound()}
                    >
                      {followUpUnlocked && currentRound === DEBATE_STANDARD_ROUNDS
                        ? 'Bonus round — final push'
                        : 'Next round — push further'}
                    </button>
                    <button
                      type="button"
                      className="debate-action-btn"
                      onClick={handleInterjection}
                      disabled={!interjection.trim()}
                      aria-label="Send interjection to redirect the debate"
                      style={{
                        minWidth: '160px',
                        padding: '14px 24px',
                        borderRadius: '999px',
                        background: '#1A1714',
                        color: '#F3F0E7',
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#A0A39A',
                    textAlign: 'center',
                    fontFamily: 'var(--vp-font-sans)',
                    lineHeight: 1.5,
                  }}
                >
                  {currentRound >= DEBATE_BONUS_ROUNDS
                    ? 'Bonus round complete — the arena rests.'
                    : 'Debate complete.'}
                </p>
                <button
                  type="button"
                  className="debate-action-btn"
                  aria-label="Return to Arena"
                  onClick={() => {
                    abortRef.current?.abort();
                    onExit();
                  }}
                  style={{
                    padding: '14px 24px',
                    borderRadius: '999px',
                    background: '#1A1714',
                    color: '#F3F0E7',
                    border: 'none',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Back to Arena
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#A0A39A' }}>The arena is reacting...</div>
        )}
          </div>
        </>
      )}
    </div>
  );
}
