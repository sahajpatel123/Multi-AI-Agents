import { useCallback, useEffect, useRef, useState } from 'react';
import { PromptInput } from './components/PromptInput';
import { AgentCard } from './components/AgentCard';
import { DebateMode } from './components/DebateMode';
import { DiscussMode } from './components/DiscussMode';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { UserMenu } from './components/UserMenu';
import { streamPrompt, getSession } from './api';
import { useAuth } from './hooks/useAuth';
import { PromptResponse, ScoredAgent, SessionData, SessionTurn } from './types';

const AGENT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;

type Phase = 'idle' | 'pipeline' | 'streaming' | 'scoring' | 'done';
type ViewMode = 'arena' | 'debate' | 'discuss';

function App() {
  const { user, isLoading: authLoading, login, register, logout, refreshUser } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [guestPromptCount, setGuestPromptCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarToggleHovered, setIsSidebarToggleHovered] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [response, setResponse] = useState<PromptResponse | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('arena');
  const [challengedAgent, setChallengedAgent] = useState<ScoredAgent | null>(null);
  const [discussAgent, setDiscussAgent] = useState<ScoredAgent | null>(null);

  // Session management
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  // Per-agent streaming state
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [doneAgents, setDoneAgents] = useState<Set<string>>(new Set());

  // Ref to accumulate tokens without re-rendering on every single token
  const tokenBuffers = useRef<Record<string, string>>({});
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const loadTurn = (turn: SessionTurn) => {
    // Convert SessionTurn to PromptResponse format
    const scoredResponses = Object.entries(turn.agent_responses).map(([agentId, response]) => ({
      response,
      score: agentId === turn.winner_id ? 100 : 75,
      is_winner: agentId === turn.winner_id,
    }));

    const promptResponse: PromptResponse = {
      session_id: sessionData?.session_id || '',
      prompt: turn.prompt,
      prompt_category: '',
      winner: turn.agent_responses[turn.winner_id],
      winner_agent_id: turn.winner_id,
      all_responses: scoredResponses,
      integrity: null,
      timestamp: turn.timestamp,
      tools_used: [],
    };

    setResponse(promptResponse);
    setExpandedAgent(turn.winner_id);
    setActiveTurnId(turn.turn_id);
    setPhase('done');
  };

  const handleTurnClick = (turnId: string) => {
    const turn = sessionData?.turns.find((t) => t.turn_id === turnId);
    if (turn) {
      loadTurn(turn);
      setIsSidebarOpen(false);
    }
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

  const handleSubmit = async (prompt: string) => {
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

  const toggleAgent = (agentId: string) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
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

  const isLoading = phase === 'pipeline';
  const isStreaming = phase === 'streaming' || phase === 'scoring';
  const isDone = phase === 'done';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sidebar */}
      {viewMode === 'arena' && (
        <Sidebar
          turns={(sessionData?.turns || []).map((t) => ({
            turn_id: t.turn_id,
            prompt: t.prompt,
            winner_id: t.winner_id,
            timestamp: t.timestamp,
          }))}
          activeTurnId={activeTurnId}
          onTurnClick={handleTurnClick}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Arena View - New Layout */}
      {viewMode === 'arena' && (
        <>
          {/* Top Bar: Sidebar Trigger + Auth */}
          <header className="flex items-center justify-between px-6 py-4">
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
                  ? '0 12px 36px rgba(26, 23, 20, 0.14), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.3)'
                  : isSidebarOpen
                    ? '0 8px 20px rgba(26, 23, 20, 0.14)'
                    : '0 4px 10px rgba(26, 23, 20, 0.08)',
                transition: 'all 280ms cubic-bezier(0.22, 1, 0.36, 1)',
                transform: isSidebarToggleHovered ? 'translateY(-2px)' : isSidebarOpen ? 'translateY(-1px)' : 'translateY(0)',
                backdropFilter: isSidebarToggleHovered ? 'blur(20px)' : 'blur(0px)',
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
                  transition: 'opacity 0.4s ease',
                  pointerEvents: 'none',
                  background: `linear-gradient(
                    135deg,
                    rgba(255,255,255,0.45) 0%,
                    rgba(255,255,255,0.15) 40%,
                    rgba(255,255,255,0.0) 60%,
                    rgba(26, 23, 20, 0.08) 100%
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
              padding: '8px',
              paddingBottom: '80px',
              minHeight: 0,
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
                  gridTemplateRows: '1fr 1fr',
                  gap: '8px',
                  flex: 1,
                  minHeight: 0,
                  transition: 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                  transform: isSidebarOpen ? 'translateX(min(54px, 6vw))' : 'translateX(0)',
                  willChange: 'transform',
                }}
              >
              {/* Pipeline loading — skeleton cards */}
              {isLoading && AGENT_IDS.map((id) => (
                <div key={id} className="bg-surface rounded-lg border border-border p-6">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-border/50 rounded w-1/3"></div>
                    <div className="h-3 bg-border/30 rounded w-full"></div>
                    <div className="h-3 bg-border/30 rounded w-5/6"></div>
                  </div>
                </div>
              ))}

              {/* Streaming phase — show live tokens */}
              {isStreaming && AGENT_IDS.map((id) => (
                <AgentCard
                  key={id}
                  agentId={id}
                  isExpanded={false}
                  onToggle={() => {}}
                  streamingText={streamingTexts[id] || ''}
                  isStreaming={!doneAgents.has(id)}
                />
              ))}

              {/* Final results */}
              {isDone && response && [...response.all_responses]
                .sort((a, b) => b.score - a.score)
                .map((scoredAgent) => (
                  <AgentCard
                    key={scoredAgent.response.agent_id}
                    agentId={scoredAgent.response.agent_id}
                    scoredAgent={scoredAgent}
                    isExpanded={expandedAgent === scoredAgent.response.agent_id}
                    onToggle={() => toggleAgent(scoredAgent.response.agent_id)}
                    onChallenge={() => handleChallenge(scoredAgent)}
                    onDiscuss={() => handleDiscuss(scoredAgent)}
                  />
                ))}

              {/* Idle state — show cards with one-liners */}
              {phase === 'idle' && !error && AGENT_IDS.map((id) => (
                <AgentCard
                  key={id}
                  agentId={id}
                  isExpanded={false}
                  onToggle={() => {}}
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

          {/* Fixed Bottom Prompt Box */}
          <PromptInput
            onSubmit={handleSubmit}
            isLoading={isLoading || isStreaming}
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

      {/* Debate & Discuss Views - Keep Original Layout */}
      {viewMode !== 'arena' && (
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
