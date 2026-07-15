import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { streamDiscuss } from '../api';
import {
  ScoredAgent,
  DiscussChatMessage,
  AGENTS,
} from '../types';
import { AgentDot } from './AgentDot';
import { usePanel } from '../context/PanelContext';
import {
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
  DISCUSS_MESSAGE_MAX_CHARS,
} from '../lib/charBudget';
import { useBusyDocumentTitle } from '../hooks/useBusyDocumentTitle';
import { useBusyNavigationGuard } from '../hooks/useBusyNavigationGuard';
import { discussWorkInFlight } from '../lib/busyNavigationGuard';
import { titleForArenaBusy } from '../lib/documentTitle';
import { scrollBehavior } from '../lib/motion';

interface DiscussModeProps {
  originalPrompt: string;
  activeAgent: ScoredAgent;
  allResponses: ScoredAgent[];
  sessionId: string;
  onExit: () => void;
  onSwitchAgent: (agentId: string) => void;
  onSuccess?: () => void;
}

export function DiscussMode({
  originalPrompt,
  activeAgent,
  allResponses,
  sessionId,
  onExit,
  onSwitchAgent,
  onSuccess,
}: DiscussModeProps) {
  const { panel } = usePanel();
  const slotIndex = ['agent_1', 'agent_2', 'agent_3', 'agent_4'].indexOf(
    activeAgent.response.agent_id,
  );
  const persona = slotIndex >= 0 ? panel[slotIndex] : null;
  const agentConfig = useMemo(
    () => ({
      ...AGENTS[activeAgent.response.agent_id],
      name: persona?.name || AGENTS[activeAgent.response.agent_id]?.name || activeAgent.response.agent_id,
      color: persona?.color || AGENTS[activeAgent.response.agent_id]?.color || '#6B6460',
    }),
    [activeAgent.response.agent_id, persona?.name, persona?.color],
  );

  // Per-agent conversation histories (so switching back preserves context)
  const [histories, setHistories] = useState<Record<string, DiscussChatMessage[]>>({});
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tokenBuffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentHistory = histories[activeAgent.response.agent_id] || [];
  const discussBusy = discussWorkInFlight(isStreaming);
  useBusyNavigationGuard(discussBusy);
  useBusyDocumentTitle(discussBusy, titleForArenaBusy('discuss'), '/app');

  const flushTokens = useCallback(() => {
    setStreamingText(tokenBuffer.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    }, 50);
  }, []);

  // Focus input when agent changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeAgent.response.agent_id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setInput('');
    setError(null);
    setIsStreaming(true);
    setStreamingText('');
    tokenBuffer.current = '';

    // Optimistically add user message to history
    const updatedHistory: DiscussChatMessage[] = [
      ...currentHistory,
      { role: 'user' as const, content: msg, timestamp: new Date().toISOString() },
    ];
    setHistories((prev) => ({
      ...prev,
      [activeAgent.response.agent_id]: updatedHistory,
    }));
    scrollToBottom();

    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flushTokens, 50);

    try {
      await streamDiscuss(
        {
          agent_id: activeAgent.response.agent_id,
          message: msg,
          conversation_history: currentHistory,
          original_verdict: activeAgent.response.verdict,
          original_prompt: originalPrompt,
          session_id: sessionId,
          persona_ids: panel.map((persona) => persona.id),
        },
        {
          onToken: (data) => {
            if (abortController.signal.aborted) return;
            tokenBuffer.current += data.token;
          },
          onResult: (data) => {
            if (abortController.signal.aborted) return;
            if (flushTimer.current) clearInterval(flushTimer.current);
            setStreamingText('');
            setHistories((prev) => ({
              ...prev,
              [activeAgent.response.agent_id]: data.conversation_history,
            }));
            setIsStreaming(false);
            scrollToBottom();
            
            // Refresh user count after successful discuss message
            if (onSuccess) onSuccess();
          },
          onError: (data) => {
            if (abortController.signal.aborted) return;
            if (flushTimer.current) clearInterval(flushTimer.current);
            setError(data.detail);
            setIsStreaming(false);
          },
        },
        abortController.signal,
      );
    } catch (err) {
      if (flushTimer.current) clearInterval(flushTimer.current);
      if (abortController.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsStreaming(false);
    }
  };

  const otherAgents = allResponses.filter(
    (s) => s.response.agent_id !== activeAgent.response.agent_id
  );

  const resolveOtherDisplay = (agentId: string) => {
    const idx = ['agent_1', 'agent_2', 'agent_3', 'agent_4'].indexOf(agentId);
    const p = idx >= 0 ? panel[idx] : null;
    const base = AGENTS[agentId];
    return {
      name: p?.name || base?.name || agentId,
      color: p?.color || base?.color || '#6B6460',
    };
  };

  return (
    <div
      className="discuss-layout"
      style={{ display: 'flex', gap: '1rem', minHeight: '60vh', background: '#FAF7F4' }}
    >
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        .discuss-layout {
          flex-direction: column;
        }
        .discuss-body {
          display: flex;
          flex: 1;
          min-height: 0;
          min-width: 0;
        }
        .discuss-switcher {
          display: flex;
          flex-direction: row;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          -webkit-overflow-scrolling: touch;
          order: -1;
        }
        .discuss-switcher-label {
          display: none;
        }
        @media (min-width: 900px) {
          .discuss-layout {
            flex-direction: row;
            align-items: stretch;
          }
          .discuss-switcher {
            order: 2;
            flex-direction: column;
            width: 13.5rem;
            flex-shrink: 0;
            overflow-x: visible;
            padding-bottom: 0;
          }
          .discuss-switcher-label {
            display: block;
          }
          .discuss-body {
            order: 1;
            flex: 1;
          }
        }
      `}</style>

      {/* Switch minds — always available (was permanently display:none) */}
      {otherAgents.length > 0 ? (
        <div className="discuss-switcher" aria-label="Switch to another mind">
          <p className="discuss-switcher-label" style={{ fontSize: '11px', color: '#6B6460', fontWeight: 500, margin: '0 0 0.25rem' }}>
            Other minds
          </p>
          {otherAgents.map((scored) => {
            const other = resolveOtherDisplay(scored.response.agent_id);
            const hasHistory = (histories[scored.response.agent_id] || []).length > 0;
            return (
              <button
                key={scored.response.agent_id}
                type="button"
                onClick={() => onSwitchAgent(scored.response.agent_id)}
                disabled={isStreaming}
                title={scored.response.one_liner}
                style={{
                  textAlign: 'left',
                  background: '#FFFFFF',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '12px',
                  padding: '0.65rem 0.75rem',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  opacity: isStreaming ? 0.5 : 1,
                  transition: 'all 200ms ease',
                  minWidth: '140px',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isStreaming) e.currentTarget.style.borderColor = 'rgba(107,100,96,0.35)';
                }}
                onMouseLeave={(e) => {
                  if (!isStreaming) e.currentTarget.style.borderColor = '#E0D8D0';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.25rem' }}>
                  <AgentDot agentId={scored.response.agent_id} size={8} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A1714' }}>{other.name}</span>
                  {hasHistory ? (
                    <span
                      style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(196,149,106,0.7)', marginLeft: 'auto' }}
                      title="Has conversation history"
                    />
                  ) : null}
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#6B6460',
                    lineHeight: 1.45,
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {scored.response.one_liner}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="discuss-body">
      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Chat header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onExit();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
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
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Back to Arena
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AgentDot agentId={activeAgent.response.agent_id} size={10} />
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714' }}>
              {agentConfig.name}
            </span>
            <span style={{ fontSize: '11px', color: '#6B6460' }}>1-on-1</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', paddingRight: '4px', maxHeight: '55vh' }}>
          {/* Agent's original verdict as first message */}
          {currentHistory.length === 0 && !isStreaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '80%', background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <AgentDot agentId={activeAgent.response.agent_id} size={5} />
                  <span style={{ fontSize: '11px', fontWeight: 500, color: agentConfig.color }}>
                    {agentConfig.name}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7' }}>
                  {activeAgent.response.verdict}
                </p>
                <p style={{ fontSize: '11px', color: '#6B6460', marginTop: '8px', fontStyle: 'italic' }}>
                  Original verdict
                </p>
              </div>
            </div>
          )}

          {/* Conversation messages */}
          {currentHistory.map((msg, i) => (
            <div
              key={i}
              style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {msg.role === 'user' ? (
                <div style={{ maxWidth: '80%', background: '#1A1714', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontSize: '14px', color: '#FAF7F4', lineHeight: '1.7' }}>{msg.content}</p>
                </div>
              ) : (
                <div style={{ maxWidth: '80%', background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <AgentDot agentId={activeAgent.response.agent_id} size={5} />
                    <span style={{ fontSize: '11px', fontWeight: 500, color: agentConfig.color }}>
                      {agentConfig.name}
                    </span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Streaming agent response */}
          {isStreaming && streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '80%', background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <AgentDot agentId={activeAgent.response.agent_id} size={5} />
                  <span style={{ fontSize: '11px', fontWeight: 500, color: agentConfig.color }}>
                    {agentConfig.name}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#1A1714', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                  {streamingText}
                  <span style={{ display: 'inline-block', width: '2px', height: '16px', marginLeft: '2px', background: 'rgba(107,100,96,0.5)', animation: 'breathe 1.2s ease-in-out infinite', verticalAlign: 'text-bottom' }} />
                </p>
              </div>
            </div>
          )}

          {/* Streaming indicator when no text yet */}
          {isStreaming && !streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: agentConfig.color, animation: 'breathe 2.4s ease-in-out infinite' }} />
                  <span style={{ fontSize: '11px', color: '#6B6460', fontStyle: 'italic' }}>Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#FFFFFF', border: '0.5px solid rgba(196,149,106,0.3)', borderRadius: '10px' }}>
            <p style={{ fontSize: '11px', color: '#6B6460' }}>{error}</p>
          </div>
        )}

        {/* Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            maxLength={DISCUSS_MESSAGE_MAX_CHARS}
            onChange={(e) => setInput(clampToMax(e.target.value, DISCUSS_MESSAGE_MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${agentConfig.name}...`}
            disabled={isStreaming}
            aria-describedby="discuss-char-budget"
            style={{
              flex: 1,
              background: '#FFFFFF',
              border: '0.5px solid #E0D8D0',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '14px',
              color: '#1A1714',
              outline: 'none',
              opacity: isStreaming ? 0.5 : 1,
              transition: 'border-color 200ms ease',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#C4956A'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#E0D8D0'}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            aria-label={`Send message to ${agentConfig.name}`}
            style={{
              padding: '12px 16px',
              background: '#1A1714',
              border: 'none',
              borderRadius: '999px',
              color: '#FAF7F4',
              cursor: (isStreaming || !input.trim()) ? 'not-allowed' : 'pointer',
              opacity: (isStreaming || !input.trim()) ? 0.4 : 1,
              transition: 'all 150ms ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              if (!isStreaming && input.trim()) e.currentTarget.style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              if (!isStreaming && input.trim()) e.currentTarget.style.opacity = '1';
            }}
          >
            <Send style={{ width: '16px', height: '16px' }} aria-hidden />
          </button>
          </div>
          <span
            id="discuss-char-budget"
            title="Character budget (server max 2000)"
            style={{
              alignSelf: 'flex-end',
              fontSize: 11,
              color:
                charBudgetTone(input.length, DISCUSS_MESSAGE_MAX_CHARS) === 'danger'
                  ? '#D85A30'
                  : charBudgetTone(input.length, DISCUSS_MESSAGE_MAX_CHARS) === 'warn'
                    ? '#C4956A'
                    : '#A89070',
            }}
          >
            {charBudgetLabel(input.length, DISCUSS_MESSAGE_MAX_CHARS)}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
