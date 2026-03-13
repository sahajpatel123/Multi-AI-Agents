import { useCallback, useEffect, useRef, useState } from 'react';
import { PromptInput } from './components/PromptInput';
import { AgentCard } from './components/AgentCard';
import { DebateMode } from './components/DebateMode';
import { DiscussMode } from './components/DiscussMode';
import { LeaderboardView } from './components/LeaderboardView';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { UserMenu } from './components/UserMenu';
import { AgentDot } from './components/AgentDot';
import { streamPrompt, streamDiscuss, getSession, parseStreamedAgentPreview } from './api';
import { useAuth } from './hooks/useAuth';
import {
  AGENTS,
  DiscussChatMessage,
  PromptResponse,
  SavedResponseItem,
  ScoredAgent,
  SessionData,
  SessionTurn,
} from './types';

const AGENT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;
const EXAMPLE_PROMPTS = [
  'Should I quit my job and start a business?',
  'Is AI going to replace most jobs?',
  "What's the most important skill to learn right now?",
] as const;

type Phase = 'idle' | 'pipeline' | 'streaming' | 'scoring' | 'done';
type ViewMode = 'arena' | 'debate' | 'discuss' | 'leaderboard';
type Sentiment = 'like' | 'dislike' | null;

interface ResponsePreference {
  sentiment: Sentiment;
}

interface ScrollTarget {
  turnId: string;
  agentId: string;
}

function App() {
  const { user, isLoading: authLoading, login, register, logout, refreshUser } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [guestPromptCount, setGuestPromptCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarToggleHovered, setIsSidebarToggleHovered] = useState(false);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [focusedCardRect, setFocusedCardRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isFocusedExpanded, setIsFocusedExpanded] = useState(false);
  const [focusedHistories, setFocusedHistories] = useState<Record<string, DiscussChatMessage[]>>({});
  const [focusedChatError, setFocusedChatError] = useState<string | null>(null);
  const [focusedStreamingText, setFocusedStreamingText] = useState('');
  const [isFocusedChatStreaming, setIsFocusedChatStreaming] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [response, setResponse] = useState<PromptResponse | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [hasSubmittedPrompt, setHasSubmittedPrompt] = useState(false);
  const [presetPrompt, setPresetPrompt] = useState('');
  const [presetPromptNonce, setPresetPromptNonce] = useState(0);
  const [showPromptChips, setShowPromptChips] = useState(false);
  const [activeExamplePromptIndex, setActiveExamplePromptIndex] = useState(0);
  const [isExamplePromptHovered, setIsExamplePromptHovered] = useState(false);
  const [examplePromptPhase, setExamplePromptPhase] = useState<'visible' | 'exiting' | 'entering'>('visible');

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('arena');
  const [challengedAgent, setChallengedAgent] = useState<ScoredAgent | null>(null);
  const [discussAgent, setDiscussAgent] = useState<ScoredAgent | null>(null);

  // Session management
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<SavedResponseItem[]>([]);
  const [responsePreferences, setResponsePreferences] = useState<Record<string, ResponsePreference>>({});
  const [copyFeedback, setCopyFeedback] = useState<Record<string, boolean>>({});
  const [shareFeedback, setShareFeedback] = useState<Record<string, boolean>>({});
  const [dotFlashKeys, setDotFlashKeys] = useState<Record<string, number>>({});
  const [highlightedAgentId, setHighlightedAgentId] = useState<string | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<ScrollTarget | null>(null);

  // Per-agent streaming state
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [doneAgents, setDoneAgents] = useState<Set<string>>(new Set());

  // Ref to accumulate tokens without re-rendering on every single token
  const tokenBuffers = useRef<Record<string, string>>({});
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusedTokenBuffer = useRef('');
  const focusedFlushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusedMessagesEndRef = useRef<HTMLDivElement>(null);
  const feedbackTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Session restore on mount
  useEffect(() => {
    const storedSessionId = localStorage.getItem('arena_session_id');
    if (storedSessionId) {
      getSession(storedSessionId).then((data) => {
        if (data && data.turns.length > 0) {
          setSessionData(data);
          // Load most recent turn
          const lastTurn = data.turns[data.turns.length - 1];
          loadTurn(lastTurn);
        }
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowPromptChips(true);
    }, 300);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hasSubmittedPrompt || isExamplePromptHovered) return;

    let swapTimer: number | undefined;
    let frameOne: number | undefined;
    let frameTwo: number | undefined;

    const rotateTimer = window.setTimeout(() => {
      setExamplePromptPhase('exiting');

      swapTimer = window.setTimeout(() => {
        setActiveExamplePromptIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
        setExamplePromptPhase('entering');

        frameOne = requestAnimationFrame(() => {
          frameTwo = requestAnimationFrame(() => {
            setExamplePromptPhase('visible');
          });
        });
      }, 300);
    }, 3000);

    return () => {
      window.clearTimeout(rotateTimer);
      if (swapTimer !== undefined) window.clearTimeout(swapTimer);
      if (frameOne !== undefined) cancelAnimationFrame(frameOne);
      if (frameTwo !== undefined) cancelAnimationFrame(frameTwo);
    };
  }, [activeExamplePromptIndex, hasSubmittedPrompt, isExamplePromptHovered]);

  const loadTurn = (turn: SessionTurn) => {
    // Convert SessionTurn to PromptResponse format
    const scoredResponses = Object.entries(turn.agent_responses).map(([agentId, response]) => ({
      response,
      score: agentId === turn.winner_id ? 100 : 75,
      is_winner: agentId === turn.winner_id,
    }));

    const promptResponse: PromptResponse = {
      session_id: sessionData?.session_id || localStorage.getItem('arena_session_id') || '',
      prompt: turn.prompt,
      prompt_category: turn.prompt_category || '',
      winner: turn.agent_responses[turn.winner_id],
      winner_agent_id: turn.winner_id,
      all_responses: scoredResponses,
      integrity: null,
      timestamp: turn.timestamp,
      tools_used: [],
    };

    setResponse(promptResponse);
    setExpandedAgent(turn.winner_id);
    setCurrentPrompt(turn.prompt);
    setActiveTurnId(turn.turn_id);
    setPhase('done');
  };

  const getResponseKey = useCallback((turnId: string, agentId: string) => `${turnId}:${agentId}`, []);

  const queueFeedbackReset = useCallback((kind: 'copy' | 'share', key: string) => {
    const timeoutKey = `${kind}:${key}`;
    if (feedbackTimeouts.current[timeoutKey]) {
      clearTimeout(feedbackTimeouts.current[timeoutKey]);
    }

    const setState = kind === 'copy' ? setCopyFeedback : setShareFeedback;
    setState((prev) => ({ ...prev, [key]: true }));

    feedbackTimeouts.current[timeoutKey] = setTimeout(() => {
      setState((prev) => ({ ...prev, [key]: false }));
      delete feedbackTimeouts.current[timeoutKey];
    }, 1500);
  }, []);

  const triggerDotFlash = useCallback((agentId: string) => {
    setDotFlashKeys((prev) => ({ ...prev, [agentId]: (prev[agentId] || 0) + 1 }));
  }, []);

  const copyText = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
  }, []);

  const handleTurnClick = (turnId: string) => {
    const turn = sessionData?.turns.find((t) => t.turn_id === turnId);
    if (turn) {
      setViewMode('arena');
      loadTurn(turn);
      setIsSidebarOpen(false);
    }
  };

  const flushTokens = useCallback(() => {
    setStreamingTexts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, rawText] of Object.entries(tokenBuffers.current)) {
        const previewText = parseStreamedAgentPreview(rawText) || '';
        if (next[id] !== previewText) {
          next[id] = previewText;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleCopyResponse = useCallback(async (scoredAgent: ScoredAgent) => {
    if (!activeTurnId) return;
    const key = getResponseKey(activeTurnId, scoredAgent.response.agent_id);
    await copyText(scoredAgent.response.one_liner);
    queueFeedbackReset('copy', key);
  }, [activeTurnId, copyText, getResponseKey, queueFeedbackReset]);

  const handleShareResponse = useCallback(async (scoredAgent: ScoredAgent) => {
    if (!activeTurnId) return;
    const key = getResponseKey(activeTurnId, scoredAgent.response.agent_id);
    const agent = AGENTS[scoredAgent.response.agent_id];
    await copyText(`${agent.name} on Arena:\n${scoredAgent.response.one_liner}\n\narena.ai`);
    queueFeedbackReset('share', key);
  }, [activeTurnId, copyText, getResponseKey, queueFeedbackReset]);

  const handleLikeResponse = useCallback((scoredAgent: ScoredAgent) => {
    if (!activeTurnId) return;
    const key = getResponseKey(activeTurnId, scoredAgent.response.agent_id);
    let shouldFlash = false;

    setResponsePreferences((prev) => {
      const current = prev[key]?.sentiment || null;
      const nextSentiment: Sentiment = current === 'like' ? null : 'like';
      shouldFlash = nextSentiment === 'like';
      return {
        ...prev,
        [key]: {
          sentiment: nextSentiment,
        },
      };
    });

    if (shouldFlash) {
      triggerDotFlash(scoredAgent.response.agent_id);
    }
  }, [activeTurnId, getResponseKey, triggerDotFlash]);

  const handleDislikeResponse = useCallback((scoredAgent: ScoredAgent) => {
    if (!activeTurnId) return;
    const key = getResponseKey(activeTurnId, scoredAgent.response.agent_id);

    setResponsePreferences((prev) => {
      const current = prev[key]?.sentiment || null;
      const nextSentiment: Sentiment = current === 'dislike' ? null : 'dislike';
      return {
        ...prev,
        [key]: {
          sentiment: nextSentiment,
        },
      };
    });
  }, [activeTurnId, getResponseKey]);

  const handleSaveResponse = useCallback((scoredAgent: ScoredAgent) => {
    if (!activeTurnId || !response) return;

    const key = getResponseKey(activeTurnId, scoredAgent.response.agent_id);
    const nextItem: SavedResponseItem = {
      id: key,
      session_id: response.session_id,
      turn_id: activeTurnId,
      prompt: response.prompt,
      prompt_category: response.prompt_category,
      agent_id: scoredAgent.response.agent_id,
      one_liner: scoredAgent.response.one_liner,
      verdict: scoredAgent.response.verdict,
      timestamp: response.timestamp,
    };

    setSavedItems((prev) => {
      const exists = prev.some((item) => item.id === key);
      if (exists) {
        return prev.filter((item) => item.id !== key);
      }
      return [...prev, nextItem];
    });
  }, [activeTurnId, getResponseKey, response]);

  const handleSavedItemClick = useCallback((item: SavedResponseItem) => {
    setViewMode('arena');
    setIsSidebarOpen(false);
    setFocusedAgentId(null);
    setFocusedCardRect(null);
    setIsFocusedExpanded(false);
    setExpandedAgent(item.agent_id);
    setPendingScrollTarget({ turnId: item.turn_id, agentId: item.agent_id });

    if (activeTurnId === item.turn_id) {
      return;
    }

    const turn = sessionData?.turns.find((entry) => entry.turn_id === item.turn_id);
    if (turn) {
      loadTurn(turn);
      setExpandedAgent(item.agent_id);
    }
  }, [activeTurnId, sessionData]);

  const handleSubmit = async (prompt: string) => {
    setHasSubmittedPrompt(true);

    // Reset all state
    setPhase('pipeline');
    setError(null);
    setResponse(null);
    setExpandedAgent(null);
    setCurrentPrompt(prompt);
    setStreamingTexts({});
    setDoneAgents(new Set());
    setViewMode('arena');
    setChallengedAgent(null);
    setDiscussAgent(null);
    setFocusedAgentId(null);
    setFocusedCardRect(null);
    setFocusedHistories({});
    setFocusedStreamingText('');
    setFocusedChatError(null);
    setIsFocusedChatStreaming(false);
    setHighlightedAgentId(null);
    setPendingScrollTarget(null);
    tokenBuffers.current = {};

    // Flush streaming text to state at 60fps-ish
    flushTimer.current = setInterval(flushTokens, 50);

    // Pass existing session_id if available
    const existingSessionId = sessionData?.session_id || localStorage.getItem('arena_session_id') || undefined;

    try {
      await streamPrompt(prompt, {
        onPipeline: (data) => {
          if (!data.passed) {
            setError(data.rejection_reason || 'Prompt rejected');
            setPhase('idle');
          } else {
            setPhase('streaming');
          }
        },
        onToken: (data) => {
          tokenBuffers.current[data.agent_id] =
            (tokenBuffers.current[data.agent_id] || '') + data.token;
        },
        onAgentDone: (data) => {
          // Parse the accumulated JSON and extract one_liner for display
          const rawJson = tokenBuffers.current[data.agent_id] || '';
          try {
            const parsed = JSON.parse(rawJson);
            tokenBuffers.current[data.agent_id] = parsed.one_liner || rawJson;
          } catch {
            // If parsing fails, keep the raw text
          }
          setDoneAgents((prev) => new Set(prev).add(data.agent_id));
        },
        onAgentError: (data) => {
          tokenBuffers.current[data.agent_id] =
            `[Error: ${data.error}]`;
          setDoneAgents((prev) => new Set(prev).add(data.agent_id));
        },
        onResult: (data) => {
          // Final flush
          flushTokens();
          if (flushTimer.current) clearInterval(flushTimer.current);

          setResponse(data);
          setExpandedAgent(data.winner_agent_id);
          setPhase('done');

          // Track guest usage for nudge
          if (!user) {
            setGuestPromptCount((c) => c + 1);
          }

          // Save session ID to localStorage
          localStorage.setItem('arena_session_id', data.session_id);

          // Update session data with new turn using functional update
          const currentTimestamp = new Date().toISOString();
          const newTurn: SessionTurn = {
            turn_id: `turn_${Date.now()}`,
            prompt: data.prompt,
            prompt_category: data.prompt_category,
            agent_responses: data.all_responses.reduce((acc, scored) => {
              acc[scored.response.agent_id] = scored.response;
              return acc;
            }, {} as Record<string, any>),
            winner_id: data.winner_agent_id,
            timestamp: currentTimestamp,
          };

          setSessionData((prev) => {
            if (prev && prev.session_id === data.session_id) {
              // Existing session - append new turn
              return {
                ...prev,
                turns: [...prev.turns, newTurn],
                last_active: currentTimestamp,
              };
            } else {
              // New session or first turn
              return {
                session_id: data.session_id,
                user_id: 'anonymous',
                turns: prev ? [...prev.turns, newTurn] : [newTurn],
                topics: [],
                created_at: prev?.created_at || currentTimestamp,
                last_active: currentTimestamp,
              };
            }
          });
          setActiveTurnId(newTurn.turn_id);
        },
        onError: (data) => {
          if (flushTimer.current) clearInterval(flushTimer.current);
          setError(data.detail);
          setPhase('idle');
        },
      }, existingSessionId);
    } catch (err) {
      if (flushTimer.current) clearInterval(flushTimer.current);
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setPhase('idle');
    }
  };

  const handleChallenge = (scored: ScoredAgent) => {
    setChallengedAgent(scored);
    setViewMode('debate');
  };

  const handleDiscuss = (scored: ScoredAgent) => {
    setDiscussAgent(scored);
    setViewMode('discuss');
  };

  const exitToArena = () => {
    setViewMode('arena');
    setChallengedAgent(null);
    setDiscussAgent(null);
  };

  const openLeaderboard = () => {
    setViewMode('leaderboard');
    setIsSidebarOpen(false);
  };

  const openFocusedAgent = (agentId: string, cardRect?: DOMRect) => {
    if (phase === 'pipeline') return;
    if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
    const matchedResponse = response?.all_responses.find(
      (s) => s.response.agent_id === agentId
    )?.response;
    const seedFromResponse = matchedResponse?.one_liner || matchedResponse?.verdict;
    setIsSidebarOpen(false);
    setFocusedAgentId(agentId);
    setFocusedCardRect(cardRect ? {
      top: cardRect.top,
      left: cardRect.left,
      width: cardRect.width,
      height: cardRect.height,
    } : null);
    setIsFocusedExpanded(false);
    setFocusedChatError(null);
    setFocusedStreamingText('');
    setFocusedHistories((prev) => {
      const existing = prev[agentId];
      if (existing && existing.length > 0) return prev;

      if (!seedFromResponse) return prev;

      return {
        ...prev,
        [agentId]: [{
          role: 'agent',
          content: seedFromResponse,
          timestamp: new Date().toISOString(),
        }],
      };
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsFocusedExpanded(true));
    });
  };

  const closeFocusedAgent = () => {
    setIsFocusedExpanded(false);
    if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
    setTimeout(() => {
      setFocusedAgentId(null);
      setFocusedCardRect(null);
      setFocusedStreamingText('');
      setFocusedChatError(null);
      setIsFocusedChatStreaming(false);
      focusedTokenBuffer.current = '';
    }, 360);
  };

  const focusedScored = focusedAgentId && response
    ? response.all_responses.find((s) => s.response.agent_id === focusedAgentId)
    : undefined;
  const focusedHistory = focusedAgentId ? (focusedHistories[focusedAgentId] || []) : [];
  const focusedAgentConfig = focusedAgentId ? AGENTS[focusedAgentId] : null;
  const flushFocusedTokens = useCallback(() => {
    setFocusedStreamingText(focusedTokenBuffer.current);
  }, []);

  useEffect(() => {
    if (!focusedAgentId) return;
    setTimeout(() => {
      focusedMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 40);
  }, [focusedAgentId, focusedHistory.length, focusedStreamingText]);

  useEffect(() => {
    if (!pendingScrollTarget || viewMode !== 'arena' || activeTurnId !== pendingScrollTarget.turnId) return;

    const targetNode = agentCardRefs.current[pendingScrollTarget.agentId];
    if (!targetNode) return;

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedAgentId(pendingScrollTarget.agentId);
    setPendingScrollTarget(null);

    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedAgentId(null);
    }, 1600);
  }, [activeTurnId, pendingScrollTarget, viewMode]);

  useEffect(() => () => {
    Object.values(feedbackTimeouts.current).forEach(clearTimeout);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  const handleFocusedAgentSubmit = async (message: string) => {
    if (!focusedAgentId || isFocusedChatStreaming) return;

    const trimmed = message.trim();
    if (!trimmed) return;

    setFocusedChatError(null);
    setIsFocusedChatStreaming(true);
    setFocusedStreamingText('');
    focusedTokenBuffer.current = '';

    const currentHistory = focusedHistories[focusedAgentId] || [];
    setFocusedHistories((prev) => ({
      ...prev,
      [focusedAgentId]: [
        ...currentHistory,
        { role: 'user', content: trimmed, timestamp: new Date().toISOString() },
      ],
    }));

    focusedFlushTimer.current = setInterval(flushFocusedTokens, 50);

    try {
      await streamDiscuss(
        {
          agent_id: focusedAgentId,
          message: trimmed,
          conversation_history: currentHistory,
          original_verdict: focusedScored?.response.verdict || focusedAgentConfig?.oneLiner || '',
          original_prompt: response?.prompt || currentPrompt || 'General discussion',
          session_id: response?.session_id || sessionData?.session_id || localStorage.getItem('arena_session_id') || undefined,
        },
        {
          onToken: (data) => {
            focusedTokenBuffer.current += data.token;
          },
          onResult: (data) => {
            if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
            setFocusedStreamingText('');
            setFocusedHistories((prev) => ({
              ...prev,
              [focusedAgentId]: data.conversation_history,
            }));
            setIsFocusedChatStreaming(false);
            if (user) refreshUser();
          },
          onError: (data) => {
            if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
            setFocusedChatError(data.detail);
            setIsFocusedChatStreaming(false);
          },
        }
      );
    } catch (err) {
      if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
      setFocusedChatError(err instanceof Error ? err.message : 'Failed to message agent');
      setIsFocusedChatStreaming(false);
    }
  };

  const handlePromptSubmit = (prompt: string) => {
    if (focusedAgentId) {
      void handleFocusedAgentSubmit(prompt);
      return;
    }
    void handleSubmit(prompt);
  };

  const handleExamplePromptClick = (prompt: string) => {
    setPresetPrompt(prompt);
    setPresetPromptNonce((prev) => prev + 1);
  };

  const handleAgentTitleClick = (agentId: string) => {
    setExpandedAgent((prev) => (prev === agentId ? null : agentId));
  };
  const challengeTarget = (() => {
    if (!response) return null;
    if (focusedAgentId) {
      return response.all_responses.find((s) => s.response.agent_id === focusedAgentId) || null;
    }
    if (expandedAgent) {
      return response.all_responses.find((s) => s.response.agent_id === expandedAgent) || null;
    }
    return response.all_responses.find((s) => s.response.agent_id === response.winner_agent_id) || response.all_responses[0] || null;
  })();
  const handleChallengeWidgetClick = () => {
    if (!challengeTarget) return;
    if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
    setFocusedAgentId(null);
    setFocusedCardRect(null);
    setIsFocusedExpanded(false);
    setFocusedStreamingText('');
    setFocusedChatError(null);
    setIsFocusedChatStreaming(false);
    focusedTokenBuffer.current = '';
    handleChallenge(challengeTarget);
  };

  const isLoading = phase === 'pipeline';
  const isStreaming = phase === 'streaming' || phase === 'scoring';
  const isDone = phase === 'done';
  const sortedResponses = response
    ? [...response.all_responses].sort((a, b) => b.score - a.score)
    : [];
  const savedIds = new Set(savedItems.map((item) => item.id));
  const focusedTargetStyle = {
    left: '50%',
    top: '50%',
    width: 'min(920px, calc(100vw - 96px))',
    height: 'min(620px, calc(100vh - 190px))',
    transform: 'translate(-50%, -50%)',
    borderRadius: '22px',
  };
  const focusedPanelBackgrounds: Record<string, string> = {
    agent_1: 'linear-gradient(180deg, rgba(243,245,247,0.92) 0%, rgba(238,240,242,0.92) 100%)',
    agent_2: 'linear-gradient(180deg, rgba(244,241,246,0.92) 0%, rgba(240,237,242,0.92) 100%)',
    agent_3: 'linear-gradient(180deg, rgba(241,246,243,0.92) 0%, rgba(237,242,239,0.92) 100%)',
    agent_4: 'linear-gradient(180deg, rgba(246,241,236,0.92) 0%, rgba(242,237,232,0.92) 100%)',
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={{
        background: `
          radial-gradient(1200px 560px at 12% -5%, rgba(140, 155, 171, 0.1), transparent 62%),
          radial-gradient(900px 520px at 88% 108%, rgba(176, 151, 126, 0.12), transparent 64%),
          #FAF7F4
        `,
      }}
    >
      {/* Sidebar */}
      {viewMode === 'arena' && (
        <Sidebar
          turns={(sessionData?.turns || []).map((t) => ({
            turn_id: t.turn_id,
            prompt: t.prompt,
            prompt_category: t.prompt_category,
            winner_id: t.winner_id,
            timestamp: t.timestamp,
          }))}
          activeTurnId={activeTurnId}
          onTurnClick={handleTurnClick}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onLeaderboardClick={openLeaderboard}
          savedItems={savedItems}
          onSavedItemClick={handleSavedItemClick}
        />
      )}

      {/* Arena View - New Layout */}
      {viewMode === 'arena' && (
        <>
          {/* Top Bar: Sidebar Trigger + Auth */}
          <header
            className="flex items-center justify-between px-6 py-4"
            style={{
              position: 'relative',
              zIndex: 80,
              filter: focusedAgentId ? 'blur(4px)' : 'blur(0px)',
              transition: 'filter 320ms cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: focusedAgentId ? 'none' : 'auto',
            }}
          >
            <div
              style={{
                transition: 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                transform: isSidebarOpen
                  ? 'translateX(min(224px, calc(88vw - 84px)))'
                  : 'translateX(0)',
                willChange: 'transform',
              }}
            >
              <button
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                onMouseEnter={() => setIsSidebarToggleHovered(true)}
                onMouseLeave={() => setIsSidebarToggleHovered(false)}
                aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                className="group relative"
                style={{
                  width: '40px',
                  height: '28px',
                  borderRadius: '6px',
                  border: isSidebarToggleHovered
                    ? '1px solid rgba(255,255,255,0.7)'
                    : '1.75px solid rgba(119, 115, 110, 0.56)',
                  background: 'transparent',
                  boxShadow: isSidebarToggleHovered
                    ? '0 10px 22px rgba(26, 23, 20, 0.12), inset 0 1px 0 rgba(255,255,255,0.76)'
                    : isSidebarOpen
                      ? '0 6px 16px rgba(26, 23, 20, 0.1)'
                      : '0 2px 8px rgba(26, 23, 20, 0.06)',
                  transition: 'all 280ms cubic-bezier(0.22, 1, 0.36, 1)',
                  transform: isSidebarToggleHovered ? 'translateY(-1px)' : 'translateY(0)',
                  backdropFilter: isSidebarToggleHovered ? 'blur(8px)' : 'blur(0px)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'inherit',
                    opacity: isSidebarToggleHovered ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: 'none',
                    background: `linear-gradient(
                      140deg,
                      rgba(255,255,255,0.26) 0%,
                      rgba(255,255,255,0.08) 48%,
                      rgba(26, 23, 20, 0.06) 100%
                    )`,
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '5px',
                    bottom: '5px',
                    left: '50%',
                    width: '1.75px',
                    background: 'rgba(119, 115, 110, 0.56)',
                    transform: 'translateX(-50%)',
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '6px',
                    right: '6px',
                    top: '5px',
                    bottom: '5px',
                    border: '1.75px solid rgba(119, 115, 110, 0.56)',
                    borderRadius: '3px',
                  }}
                />
              </button>
            </div>
            <UserMenu
              user={user}
              isLoading={authLoading}
              onSignInClick={() => { setAuthModalTab('login'); setAuthModalOpen(true); }}
              onLogout={logout}
            />
          </header>

          {/* Main Content Area */}
          <div
            className="flex-1"
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '18px 32px 138px 32px',
              minHeight: 0,
              position: 'relative',
              zIndex: 10,
              filter: focusedAgentId ? 'blur(6px)' : 'blur(0px)',
              transition: 'filter 340ms cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: focusedAgentId ? 'none' : 'auto',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Current Prompt Display (when active) */}
              {currentPrompt && phase !== 'idle' && (
                <div className="text-center mb-4">
                  <p className="text-sm text-text-secondary italic">
                    "{currentPrompt}"
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 p-4 bg-surface border border-accent/30 rounded-lg text-text-primary max-w-2xl mx-auto">
                  <p className="text-sm font-medium text-accent mb-1">Cannot process</p>
                  <p className="text-text-secondary text-sm">{error}</p>
                </div>
              )}

              {/* Agent Cards - Always Visible in 2x2 Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
                  columnGap: '22px',
                  rowGap: '24px',
                  flex: 1,
                  minHeight: 0,
                  marginBottom: '10px',
                  transition: 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                  transform: isSidebarOpen ? 'translateX(min(54px, 6vw))' : 'translateX(0)',
                  willChange: 'transform',
                }}
              >
              {/* Pipeline loading — skeleton cards */}
              {isLoading && AGENT_IDS.map((id) => (
                <AgentCard
                  key={id}
                  agentId={id}
                  isExpanded={false}
                  onToggle={() => {}}
                  isLoadingState={true}
                />
              ))}

              {/* Streaming phase — show live tokens */}
              {isStreaming && AGENT_IDS.map((id) => (
                <AgentCard
                  key={id}
                  agentId={id}
                  isExpanded={false}
                  onToggle={(cardRect) => openFocusedAgent(id, cardRect)}
                  streamingText={streamingTexts[id] || ''}
                  isStreaming={!doneAgents.has(id)}
                />
              ))}

              {/* Final results */}
              {isDone && response && sortedResponses.map((scoredAgent) => {
                  const responseKey = activeTurnId
                    ? getResponseKey(activeTurnId, scoredAgent.response.agent_id)
                    : null;
                  const preference = responseKey ? responsePreferences[responseKey]?.sentiment || null : null;
                  const isSaved = responseKey ? savedIds.has(responseKey) : false;

                  return (
                  <AgentCard
                    key={scoredAgent.response.agent_id}
                    agentId={scoredAgent.response.agent_id}
                    scoredAgent={scoredAgent}
                    isExpanded={expandedAgent === scoredAgent.response.agent_id}
                    onTitleClick={() => handleAgentTitleClick(scoredAgent.response.agent_id)}
                    onToggle={(cardRect) => openFocusedAgent(scoredAgent.response.agent_id, cardRect)}
                    onChallenge={() => handleChallenge(scoredAgent)}
                    onDiscuss={() => handleDiscuss(scoredAgent)}
                    cardRef={(node) => {
                      agentCardRefs.current[scoredAgent.response.agent_id] = node;
                    }}
                    isHighlighted={highlightedAgentId === scoredAgent.response.agent_id}
                    dotFlashKey={dotFlashKeys[scoredAgent.response.agent_id] || 0}
                    onCopy={() => { void handleCopyResponse(scoredAgent); }}
                    onLike={() => handleLikeResponse(scoredAgent)}
                    onDislike={() => handleDislikeResponse(scoredAgent)}
                    onShare={() => { void handleShareResponse(scoredAgent); }}
                    onSave={() => handleSaveResponse(scoredAgent)}
                    isLiked={preference === 'like'}
                    isDisliked={preference === 'dislike'}
                    isSaved={isSaved}
                    copyFeedbackActive={Boolean(responseKey && copyFeedback[responseKey])}
                    shareFeedbackActive={Boolean(responseKey && shareFeedback[responseKey])}
                  />
                );
              })}

              {/* Idle state — show cards with one-liners */}
              {phase === 'idle' && !error && AGENT_IDS.map((id) => (
                <AgentCard
                  key={id}
                  agentId={id}
                  isExpanded={false}
                  onToggle={(cardRect) => openFocusedAgent(id, cardRect)}
                  isIdle={true}
                />
              ))}
              </div>

              {/* Scoring indicator */}
              {isStreaming && doneAgents.size === 4 && (
                <p className="text-center text-sm text-text-secondary animate-pulse mt-4">
                  Scoring responses...
                </p>
              )}

              {/* Tools used indicator (when done) */}
              {isDone && response?.tools_used && response.tools_used.length > 0 && (
                <div className="text-center mt-4">
                  <div className="inline-flex items-center gap-2 text-xs text-text-secondary italic">
                    <span>Tools used:</span>
                    {response.tools_used.map((tool, idx) => (
                      <span key={idx} className="bg-border/30 px-2 py-0.5 rounded">
                        {tool === 'calculator' && '🔢 Calculator'}
                        {tool === 'web_search' && '🔍 Web search'}
                        {tool === 'datetime' && '📅 DateTime'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {focusedAgentId && focusedAgentConfig && (
            <>
              <div
                className="fixed inset-0 z-30 bg-text-primary/10"
                style={{
                  opacity: isFocusedExpanded ? 1 : 0,
                  transition: 'opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                onClick={closeFocusedAgent}
              />
              <div
                className="fixed z-40 overflow-hidden"
                style={{
                  ...(isFocusedExpanded
                    ? focusedTargetStyle
                    : focusedCardRect
                      ? {
                          left: `${focusedCardRect.left}px`,
                          top: `${focusedCardRect.top}px`,
                          width: `${focusedCardRect.width}px`,
                          height: `${focusedCardRect.height}px`,
                          borderRadius: '16px',
                        }
                      : focusedTargetStyle),
                  transition: 'all 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                  background: focusedPanelBackgrounds[focusedAgentId] || 'rgba(250, 247, 244, 0.78)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.65)',
                  boxShadow: '0 24px 54px rgba(26, 23, 20, 0.22)',
                }}
              >
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border/70">
                    <div className="flex items-center gap-2.5">
                      <AgentDot agentId={focusedAgentId} size={10} flashKey={dotFlashKeys[focusedAgentId] || 0} />
                      <p className="font-semibold text-text-primary">{focusedAgentConfig.name}</p>
                    </div>
                    <button
                      onClick={closeFocusedAgent}
                      className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {focusedHistory.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'user' ? (
                          <div className="max-w-[82%] rounded-xl px-4 py-3 border border-accent/25 bg-accent/10">
                            <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        ) : (
                          <div
                            className="max-w-[82%] rounded-xl px-4 py-3 border"
                            style={{
                              borderColor: `${focusedAgentConfig.color}35`,
                              backgroundColor: `${focusedAgentConfig.color}10`,
                            }}
                          >
                            <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    {isFocusedChatStreaming && (
                      <div className="flex justify-start">
                        <div
                          className="max-w-[82%] rounded-xl px-4 py-3 border"
                          style={{
                            borderColor: `${focusedAgentConfig.color}35`,
                            backgroundColor: `${focusedAgentConfig.color}10`,
                          }}
                        >
                          <p className="text-[15px] text-text-primary leading-relaxed whitespace-pre-wrap">
                            {focusedStreamingText}
                            <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-text-secondary/50 animate-pulse align-text-bottom" />
                          </p>
                        </div>
                      </div>
                    )}

                    {focusedChatError && (
                      <div className="rounded-lg border border-accent/30 bg-surface px-3 py-2">
                        <p className="text-xs text-text-secondary">{focusedChatError}</p>
                      </div>
                    )}

                    <div ref={focusedMessagesEndRef} />
                  </div>
                </div>
              </div>
            </>
          )}

          {viewMode === 'arena' && phase === 'idle' && !error && !hasSubmittedPrompt && (
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: '94px',
                display: 'flex',
                justifyContent: 'center',
                padding: '0 24px',
                zIndex: 49,
                pointerEvents: 'none',
                opacity: showPromptChips ? 1 : 0,
                transition: 'opacity 400ms ease',
              }}
            >
              <button
                type="button"
                onClick={() => handleExamplePromptClick(EXAMPLE_PROMPTS[activeExamplePromptIndex])}
                onMouseEnter={() => setIsExamplePromptHovered(true)}
                onMouseLeave={() => setIsExamplePromptHovered(false)}
                style={{
                  pointerEvents: 'all',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  maxWidth: '720px',
                  background: '#F0EBE3',
                  border: '1px solid #E0D8D0',
                  borderRadius: '999px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  color: '#6B6460',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: examplePromptPhase === 'exiting' ? 0 : 1,
                  transform:
                    examplePromptPhase === 'exiting'
                      ? 'translateY(-6px)'
                      : examplePromptPhase === 'entering'
                        ? 'translateY(6px)'
                        : isExamplePromptHovered
                          ? 'translateY(-1px)'
                          : 'translateY(0)',
                  transition:
                    examplePromptPhase === 'visible'
                      ? 'background 150ms ease, color 150ms ease, transform 150ms ease, opacity 300ms ease'
                      : 'opacity 300ms ease, transform 300ms ease',
                  backgroundColor: isExamplePromptHovered ? '#E0D8D0' : '#F0EBE3',
                  color: isExamplePromptHovered ? '#1A1714' : '#6B6460',
                }}
              >
                {EXAMPLE_PROMPTS[activeExamplePromptIndex]}
              </button>
            </div>
          )}

          {/* Fixed Bottom Prompt Box */}
          <PromptInput
            onSubmit={handlePromptSubmit}
            isLoading={focusedAgentId ? isFocusedChatStreaming : (isLoading || isStreaming)}
            placeholder={
              focusedAgentId && focusedAgentConfig
                ? `Message ${focusedAgentConfig.name} directly...`
                : 'Ask something and watch four minds respond...'
            }
            presetPrompt={presetPrompt}
            presetPromptNonce={presetPromptNonce}
            showChallengeWidget={viewMode === 'arena'}
            onChallengeClick={handleChallengeWidgetClick}
            isChallengeEnabled={Boolean(challengeTarget) && !isLoading && !isStreaming}
            challengeTitle={
              challengeTarget
                ? `Challenge ${AGENTS[challengeTarget.response.agent_id].name}`
                : 'Challenge is available after responses are ready'
            }
          />
          
          {/* Guest nudge after 3rd use */}
          {!user && !authLoading && guestPromptCount >= 3 && (
            <div className="fixed bottom-20 left-0 right-0 z-40 pointer-events-none">
              <p className="text-center text-xs text-text-secondary">
                <button
                  onClick={() => { setAuthModalTab('signup'); setAuthModalOpen(true); }}
                  className="text-accent hover:underline pointer-events-auto"
                >
                  Sign up
                </button>
                {' '}to save your history and get 20 prompts per day.
              </p>
            </div>
          )}
        </>
      )}

      {viewMode === 'leaderboard' && (
        <div className="max-w-5xl mx-auto px-4 py-12 w-full">
          <div className="flex items-center justify-end mb-6">
            <UserMenu
              user={user}
              isLoading={authLoading}
              onSignInClick={() => { setAuthModalTab('login'); setAuthModalOpen(true); }}
              onLogout={logout}
            />
          </div>
          <LeaderboardView
            turns={sessionData?.turns || []}
            onBack={exitToArena}
          />
        </div>
      )}

      {/* Debate & Discuss Views - Keep Original Layout */}
      {(viewMode === 'debate' || viewMode === 'discuss') && (
        <div className="max-w-4xl mx-auto px-4 py-12">
          <header className="mb-12">
            <div className="flex items-center justify-end mb-6">
              <UserMenu
                user={user}
                isLoading={authLoading}
                onSignInClick={() => { setAuthModalTab('login'); setAuthModalOpen(true); }}
                onLogout={logout}
              />
            </div>
            <div className="text-center">
              <h1
                className="font-serif text-4xl font-semibold text-text-primary mb-2 cursor-pointer"
                onClick={exitToArena}
              >
                Arena
              </h1>
              <p className="text-text-secondary">
                Four minds. One question. The best answer wins.
              </p>
            </div>
          </header>

          {viewMode === 'debate' && response && challengedAgent && (
            <DebateMode
              originalPrompt={response.prompt}
              challengedAgent={challengedAgent}
              sessionId={response.session_id}
              onExit={exitToArena}
              onSuccess={refreshUser}
            />
          )}

          {viewMode === 'discuss' && response && discussAgent && (
            <DiscussMode
              originalPrompt={response.prompt}
              activeAgent={discussAgent}
              allResponses={response.all_responses}
              sessionId={response.session_id}
              onExit={exitToArena}
              onSuccess={refreshUser}
              onSwitchAgent={(agentId) => {
                const found = response.all_responses.find(
                  (s) => s.response.agent_id === agentId
                );
                if (found) setDiscussAgent(found);
              }}
            />
          )}
        </div>
      )}

      {/* Auth modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={login}
        onRegister={register}
        defaultTab={authModalTab}
      />
    </div>
  );
}

export default App;
