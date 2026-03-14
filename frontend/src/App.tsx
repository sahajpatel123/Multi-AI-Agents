import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
  const [currentResponses, setCurrentResponses] = useState<PromptResponse | null>(null);
  const [animateCurrentResponseBars, setAnimateCurrentResponseBars] = useState(false);
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
  const currentResponseBarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setCurrentResponses(promptResponse);
    setAnimateCurrentResponseBars(false);
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

  const handleNewChat = useCallback(() => {
    if (flushTimer.current) clearInterval(flushTimer.current);
    if (focusedFlushTimer.current) clearInterval(focusedFlushTimer.current);
    if (currentResponseBarTimer.current) clearTimeout(currentResponseBarTimer.current);

    setPhase('idle');
    setResponse(null);
    setCurrentResponses(null);
    setAnimateCurrentResponseBars(false);
    setExpandedAgent(null);
    setError(null);
    setCurrentPrompt('');
    setHasSubmittedPrompt(false);
    setPresetPrompt('');
    setPresetPromptNonce((prev) => prev + 1);
    setStreamingTexts({});
    setDoneAgents(new Set());
    setViewMode('arena');
    setChallengedAgent(null);
    setDiscussAgent(null);
    setFocusedAgentId(null);
    setFocusedCardRect(null);
    setIsFocusedExpanded(false);
    setFocusedHistories({});
    setFocusedStreamingText('');
    setFocusedChatError(null);
    setIsFocusedChatStreaming(false);
    setHighlightedAgentId(null);
    setPendingScrollTarget(null);
    setActiveTurnId(null);
    tokenBuffers.current = {};
    focusedTokenBuffer.current = '';
    setIsSidebarOpen(false);
  }, []);

  const handleSubmit = async (prompt: string) => {
    setHasSubmittedPrompt(true);

    // Reset all state
    setPhase('pipeline');
    setError(null);
    setResponse(null);
    setCurrentResponses(null);
    setAnimateCurrentResponseBars(false);
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
          setCurrentResponses(data);
          setAnimateCurrentResponseBars(true);
          if (currentResponseBarTimer.current) clearTimeout(currentResponseBarTimer.current);
          currentResponseBarTimer.current = setTimeout(() => {
            setAnimateCurrentResponseBars(false);
          }, 750);
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
    if (currentResponseBarTimer.current) clearTimeout(currentResponseBarTimer.current);
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
    openFocusedAgent(agentId);
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
  const sortedResponses = currentResponses
    ? [...currentResponses.all_responses].sort((a, b) => b.score - a.score)
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
      style={{
        minHeight: '100vh',
        background: '#FAF7F4',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes floatOrb1 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(60px, 40px); }
        }
        @keyframes floatOrb2 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(-50px, -60px); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes cardEntrance1 {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardEntrance2 {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardEntrance3 {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardEntrance4 {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes winnerPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
      `}</style>

      {/* Ambient Orbs */}
      <div style={{ position: 'fixed', top: '-100px', left: '-200px', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,149,106,0.05) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0, animation: 'floatOrb1 18s ease-in-out infinite alternate', willChange: 'transform' }} />
      <div style={{ position: 'fixed', bottom: '-100px', right: '-150px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,168,153,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0, animation: 'floatOrb2 22s ease-in-out infinite alternate', willChange: 'transform' }} />

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
          onNewChat={handleNewChat}
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
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 80,
              height: '52px',
              borderBottom: '0.5px solid #E0D8D0',
              background: 'rgba(250,247,244,0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              filter: focusedAgentId ? 'blur(4px)' : 'blur(0px)',
              transition: 'filter 320ms cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: focusedAgentId ? 'none' : 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
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
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSidebarToggleHovered ? '#F0EBE3' : 'transparent',
                  transition: 'all 150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ position: 'relative', zIndex: 1 }}>
                  <rect x="2" y="4" width="12" height="1.5" rx="0.75" fill="#6B6460" />
                  <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="#6B6460" />
                  <rect x="2" y="10.5" width="12" height="1.5" rx="0.75" fill="#6B6460" />
                </svg>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/')}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }} className="breathe" />
                <span style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
              </div>
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
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 32px 138px 32px',
              background: '#FAF7F4',
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
                <div style={{ textAlign: 'center', marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
                  <p style={{ fontSize: '14px', color: '#6B6460', fontStyle: 'italic' }}>
                    "{currentPrompt}"
                  </p>
                  <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#FFFFFF', border: '0.5px solid rgba(196,149,106,0.3)', borderRadius: '12px', maxWidth: '600px', margin: '0 auto 1rem' }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#C4956A', marginBottom: '0.25rem' }}>Cannot process</p>
                  <p style={{ fontSize: '13px', color: '#6B6460' }}>{error}</p>
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
              {isDone && currentResponses && sortedResponses.map((scoredAgent, index) => {
                  const responseKey = activeTurnId
                    ? getResponseKey(activeTurnId, scoredAgent.response.agent_id)
                    : null;
                  const preference = responseKey ? responsePreferences[responseKey]?.sentiment || null : null;
                  const isSaved = responseKey ? savedIds.has(responseKey) : false;

                  return (
                  <div
                    key={scoredAgent.response.agent_id}
                    style={{
                      animation: `cardEntrance${index + 1} 500ms cubic-bezier(0.16,1,0.3,1) ${index * 80}ms backwards`,
                      willChange: 'transform',
                    }}
                  >
                    <AgentCard
                      agentId={scoredAgent.response.agent_id}
                      scoredAgent={scoredAgent}
                      isExpanded={false}
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
                      animateConfidenceBar={animateCurrentResponseBars}
                      prompt={currentPrompt}
                    />
                  </div>
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
                <p style={{ textAlign: 'center', fontSize: '13px', color: '#6B6460', animation: 'breathe 2.4s ease-in-out infinite', marginTop: '1rem' }}>
                  Scoring responses...
                </p>
              )}

              {/* Tools used indicator (when done) */}
              {isDone && response?.tools_used && response.tools_used.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#6B6460', fontStyle: 'italic' }}>
                    <span>Tools used:</span>
                    {response.tools_used.map((tool, idx) => (
                      <span key={idx} style={{ background: '#F0EBE3', padding: '2px 8px', borderRadius: '999px' }}>
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
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 30,
                  background: 'rgba(26, 23, 20, 0.1)',
                  opacity: isFocusedExpanded ? 1 : 0,
                  transition: 'opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                onClick={closeFocusedAgent}
              />
              <div
                style={{
                  position: 'fixed',
                  zIndex: 40,
                  overflow: 'hidden',
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
                  background: focusedPanelBackgrounds[focusedAgentId] || 'rgba(250, 247, 244, 0.95)',
                  backdropFilter: 'blur(14px)',
                  border: '0.5px solid #E0D8D0',
                  boxShadow: '0 24px 54px rgba(26, 23, 20, 0.15)',
                }}
              >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '0.5px solid #E0D8D0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <AgentDot agentId={focusedAgentId} size={8} flashKey={dotFlashKeys[focusedAgentId] || 0} />
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714' }}>{focusedAgentConfig.name}</p>
                    </div>
                    <button
                      onClick={closeFocusedAgent}
                      style={{
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
                      Close
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {focusedHistory.map((msg, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {msg.role === 'user' ? (
                          <div style={{ maxWidth: '82%', borderRadius: '12px', padding: '12px 14px', background: '#1A1714' }}>
                            <p style={{ fontSize: '14px', color: '#FAF7F4', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                          </div>
                        ) : (
                          <div style={{ maxWidth: '82%', borderRadius: '12px', padding: '12px 14px', border: '0.5px solid #E0D8D0', background: '#FFFFFF' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                              <AgentDot agentId={focusedAgentId} size={5} />
                              <span style={{ fontSize: '11px', fontWeight: 500, color: focusedAgentConfig.color }}>
                                {focusedAgentConfig.name}
                              </span>
                            </div>
                            <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    {isFocusedChatStreaming && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ maxWidth: '82%', borderRadius: '12px', padding: '12px 14px', border: '0.5px solid #E0D8D0', background: '#FFFFFF' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <AgentDot agentId={focusedAgentId} size={5} />
                            <span style={{ fontSize: '11px', fontWeight: 500, color: focusedAgentConfig.color }}>
                              {focusedAgentConfig.name}
                            </span>
                          </div>
                          <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                            {focusedStreamingText}
                            <span style={{ display: 'inline-block', width: '2px', height: '16px', marginLeft: '2px', background: 'rgba(107,100,96,0.5)', animation: 'breathe 1.2s ease-in-out infinite', verticalAlign: 'text-bottom' }} />
                          </p>
                        </div>
                      </div>
                    )}

                    {focusedChatError && (
                      <div style={{ borderRadius: '10px', border: '0.5px solid rgba(196,149,106,0.3)', background: '#FFFFFF', padding: '0.75rem' }}>
                        <p style={{ fontSize: '11px', color: '#6B6460' }}>{focusedChatError}</p>
                      </div>
                    )}

                    <div ref={focusedMessagesEndRef} />
                  </div>
                </div>
              </div>
            </>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% - 280px - 48px)',
              maxWidth: '720px',
              zIndex: 40,
              pointerEvents: 'none',
            }}
          >
            {viewMode === 'arena' && phase === 'idle' && !error && !hasSubmittedPrompt && (
              <button
                type="button"
                onClick={() => handleExamplePromptClick(EXAMPLE_PROMPTS[activeExamplePromptIndex])}
                onMouseEnter={() => setIsExamplePromptHovered(true)}
                onMouseLeave={() => setIsExamplePromptHovered(false)}
                style={{
                  pointerEvents: 'all',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: 'fit-content',
                  maxWidth: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 2px',
                  fontSize: '13px',
                  color: isExamplePromptHovered ? '#3A3330' : '#8A8078',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: showPromptChips ? (examplePromptPhase === 'exiting' ? 0 : 1) : 0,
                  transform:
                    examplePromptPhase === 'exiting'
                      ? 'translateY(-5px)'
                      : examplePromptPhase === 'entering'
                        ? 'translateY(5px)'
                        : isExamplePromptHovered
                          ? 'translateY(-1px)'
                          : 'translateY(0)',
                  transition:
                    examplePromptPhase === 'visible'
                      ? 'color 150ms ease, transform 150ms ease, opacity 300ms ease'
                      : 'opacity 300ms ease, transform 300ms ease',
                  letterSpacing: '0.01em',
                  fontStyle: 'italic',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: isExamplePromptHovered ? '#C4956A' : '#C0B4A8',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                  marginBottom: '1px',
                }} />
                {EXAMPLE_PROMPTS[activeExamplePromptIndex]}
              </button>
            )}

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
          </div>
          
          {/* Guest nudge after 3rd use */}
          {!user && !authLoading && guestPromptCount >= 3 && (
            <div style={{ position: 'fixed', bottom: '80px', left: 0, right: 0, zIndex: 40, pointerEvents: 'none' }}>
              <p style={{ textAlign: 'center', fontSize: '11px', color: '#6B6460' }}>
                <button
                  onClick={() => { setAuthModalTab('signup'); setAuthModalOpen(true); }}
                  style={{
                    color: '#C4956A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    textDecoration: 'none',
                    transition: 'text-decoration 150ms ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
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
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '3rem 1rem', width: '100%', background: '#FAF7F4' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
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
        <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '3rem 1rem', background: '#FAF7F4' }}>
          <header style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
              <UserMenu
                user={user}
                isLoading={authLoading}
                onSignInClick={() => { setAuthModalTab('login'); setAuthModalOpen(true); }}
                onLogout={logout}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h1
                style={{ fontSize: '36px', fontWeight: 500, color: '#1A1714', marginBottom: '0.5rem', cursor: 'pointer', letterSpacing: '-0.02em' }}
                onClick={exitToArena}
              >
                Arena
              </h1>
              <p style={{ fontSize: '14px', color: '#6B6460' }}>
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
