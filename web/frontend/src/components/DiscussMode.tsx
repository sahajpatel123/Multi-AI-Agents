import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { streamDiscuss } from '../api';
import {
  ScoredAgent,
  DiscussChatMessage,
  AGENTS,
} from '../types';
import { AgentAnswerMarkdown } from './AgentAnswerMarkdown';
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
import { motionDuration, prefersReducedMotion, scrollBehavior } from '../lib/motion';
import { isScrollNearBottom, shouldAutoScrollChat } from '../lib/chatScroll';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { formatDiscussExport, formatDiscussMessageCopy } from '../lib/threadExport';
import { isBareEndKey, isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';

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
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadFeedback, setDownloadFeedback] = useState<'idle' | 'done' | 'failed'>('idle');
  /** Which message key last copied: 'seed' | `msg-${i}` | null */
  const [msgCopyKey, setMsgCopyKey] = useState<string | null>(null);
  const [msgCopyStatus, setMsgCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showJumpLatest, setShowJumpLatest] = useState(false);

  const tokenBuffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  /** User is following the live end; auto-scroll stays on until they scroll up. */
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentHistory = histories[activeAgent.response.agent_id] || [];
  const discussBusy = discussWorkInFlight(isStreaming);
  useBusyNavigationGuard(discussBusy);
  useBusyDocumentTitle(discussBusy, titleForArenaBusy('discuss'), '/app');

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
    if (msgCopyStatus === 'idle') return;
    const hold = motionDuration(msgCopyStatus === 'copied' ? 1600 : 2400);
    const t = window.setTimeout(() => {
      setMsgCopyStatus('idle');
      setMsgCopyKey(null);
    }, hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [msgCopyStatus]);

  // Clear per-message copy feedback when switching minds.
  useEffect(() => {
    setMsgCopyStatus('idle');
    setMsgCopyKey(null);
  }, [activeAgent.response.agent_id]);

  const buildThreadMarkdown = () => {
    const seed: DiscussChatMessage[] =
      currentHistory.length > 0
        ? currentHistory
        : [
            {
              role: 'agent',
              content: activeAgent.response.verdict || activeAgent.response.one_liner || '',
              timestamp: new Date().toISOString(),
            },
          ];
    return formatDiscussExport({
      agentName: agentConfig.name,
      originalPrompt,
      messages: seed.map((m) => ({ role: m.role, content: m.content })),
    });
  };

  const handleCopyThread = async () => {
    const md = buildThreadMarkdown();
    const ok = await copyToClipboard(md);
    setCopyFeedback(ok ? 'copied' : 'failed');
  };

  const handleDownloadThread = () => {
    const md = buildThreadMarkdown();
    const stem = `discuss-${agentConfig.name || 'thread'}`;
    const ok = downloadMarkdownFile(md, stem);
    setDownloadFeedback(ok ? 'done' : 'failed');
  };

  const copyMessage = async (
    key: string,
    opts: {
      role: 'user' | 'agent';
      content: string;
      includeQuestion?: boolean;
    },
  ) => {
    const text = formatDiscussMessageCopy({
      role: opts.role,
      content: opts.content,
      agentName: agentConfig.name,
      originalPrompt,
      includeQuestion: opts.includeQuestion,
    });
    if (!text) {
      setMsgCopyKey(key);
      setMsgCopyStatus('failed');
      return;
    }
    const ok = await copyToClipboard(text);
    setMsgCopyKey(key);
    setMsgCopyStatus(ok ? 'copied' : 'failed');
  };

  const messageCopyButton = (
    key: string,
    opts: { role: 'user' | 'agent'; content: string; includeQuestion?: boolean; dark?: boolean },
  ) => {
    const active = msgCopyKey === key;
    const label =
      active && msgCopyStatus === 'copied'
        ? 'Copied'
        : active && msgCopyStatus === 'failed'
          ? 'Failed'
          : 'Copy';
    return (
      <button
        type="button"
        onClick={() => void copyMessage(key, opts)}
        title={opts.role === 'user' ? 'Copy your message' : 'Copy this take'}
        aria-label={
          opts.role === 'user' ? 'Copy your message' : `Copy ${agentConfig.name}'s take`
        }
        style={{
          marginTop: 8,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'Georgia, serif',
          color: opts.dark
            ? active && msgCopyStatus === 'failed'
              ? '#F5A89A'
              : active && msgCopyStatus === 'copied'
                ? '#A8D5B5'
                : 'rgba(250,247,244,0.72)'
            : active && msgCopyStatus === 'failed'
              ? '#993C1D'
              : active && msgCopyStatus === 'copied'
                ? '#5A8A5A'
                : '#C4956A',
        }}
      >
        {label}
      </button>
    );
  };

  const flushTokens = useCallback(() => {
    setStreamingText(tokenBuffer.current);
  }, []);

  const syncScrollFlags = useCallback(() => {
    const el = messagesScrollRef.current;
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
      messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
      // Re-sync after layout so the jump chip hides reliably.
      requestAnimationFrame(() => {
        stickToBottomRef.current = true;
        setShowJumpLatest(false);
      });
    }, 50);
  }, []);

  const jumpToLatest = useCallback(() => {
    scrollToBottom({ force: true });
  }, [scrollToBottom]);

  // Follow the stream only while the reader is at the live end.
  useEffect(() => {
    if (!isStreaming && !streamingText) return;
    if (!shouldAutoScrollChat({ stickToBottom: stickToBottomRef.current })) {
      setShowJumpLatest(true);
      return;
    }
    scrollToBottom();
  }, [streamingText, isStreaming, scrollToBottom]);

  // Focus input when agent changes; stick to bottom for the new thread.
  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    inputRef.current?.focus();
    scrollToBottom({ force: true });
  }, [activeAgent.response.agent_id, scrollToBottom]);

  // `/` focuses discuss compose; End jumps to latest; Escape returns to Arena.
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
      if (isStreaming) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStreaming, jumpToLatest, onExit]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  const reducedMotion = prefersReducedMotion();

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
    scrollToBottom({ force: true });

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
            scrollToBottom({ force: stickToBottomRef.current });
            
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
                className="discuss-switch-card"
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
            className="discuss-back-btn"
          >
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Back to Arena
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <AgentDot agentId={activeAgent.response.agent_id} size={10} />
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714' }}>
              {agentConfig.name}
            </span>
            <span style={{ fontSize: '11px', color: '#6B6460' }}>1-on-1</span>
            <button
              type="button"
              onClick={() => {
                void handleCopyThread();
              }}
              disabled={isStreaming}
              title="Copy conversation as markdown"
              style={{
                marginLeft: 4,
                fontSize: 12,
                color:
                  copyFeedback === 'failed'
                    ? '#993C1D'
                    : copyFeedback === 'copied'
                      ? '#5A8C6A'
                      : '#C4956A',
                background: 'none',
                border: '0.5px solid #E0D8D0',
                borderRadius: 999,
                padding: '4px 10px',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                opacity: isStreaming ? 0.5 : 1,
                fontFamily: 'Georgia, serif',
              }}
            >
              {copyFeedback === 'copied'
                ? 'Copied'
                : copyFeedback === 'failed'
                  ? 'Copy failed'
                  : 'Copy thread'}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadThread()}
              disabled={isStreaming}
              title="Download conversation as markdown"
              style={{
                fontSize: 12,
                color:
                  downloadFeedback === 'failed'
                    ? '#993C1D'
                    : downloadFeedback === 'done'
                      ? '#5A8C6A'
                      : '#C4956A',
                background: 'none',
                border: '0.5px solid #E0D8D0',
                borderRadius: 999,
                padding: '4px 10px',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                opacity: isStreaming ? 0.5 : 1,
                fontFamily: 'Georgia, serif',
              }}
            >
              {downloadFeedback === 'done'
                ? 'Downloaded'
                : downloadFeedback === 'failed'
                  ? 'Download failed'
                  : 'Download .md'}
            </button>
          </div>
        </div>
        {copyFeedback === 'failed' ||
        downloadFeedback === 'failed' ||
        msgCopyStatus === 'failed' ? (
          <p role="alert" style={{ fontSize: 12, color: '#993C1D', margin: '0 0 8px' }}>
            {msgCopyStatus === 'failed'
              ? 'Could not copy that message — try again or select text manually.'
              : copyFeedback === 'failed'
                ? 'Could not copy — try again or select text manually.'
                : 'Could not download — try Copy thread instead.'}
          </p>
        ) : null}

        {/* Messages */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <div
          ref={messagesScrollRef}
          onScroll={syncScrollFlags}
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '4px',
            maxHeight: '55vh',
          }}
        >
          {/* Agent's original verdict as first message */}
          {currentHistory.length === 0 && !isStreaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '92%', background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <AgentDot agentId={activeAgent.response.agent_id} size={5} />
                  <span style={{ fontSize: '11px', fontWeight: 500, color: agentConfig.color }}>
                    {agentConfig.name}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6B6460', fontStyle: 'italic', marginLeft: 4 }}>
                    Original take
                  </span>
                </div>
                <AgentAnswerMarkdown
                  markdown={activeAgent.response.verdict || activeAgent.response.one_liner || ''}
                  question={originalPrompt}
                />
                {messageCopyButton('seed', {
                  role: 'agent',
                  content: activeAgent.response.verdict || activeAgent.response.one_liner || '',
                  includeQuestion: true,
                })}
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
                  <p style={{ fontSize: '14px', color: '#FAF7F4', lineHeight: '1.7', whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                  {messageCopyButton(`msg-${i}`, {
                    role: 'user',
                    content: msg.content,
                    dark: true,
                  })}
                </div>
              ) : (
                <div style={{ maxWidth: '92%', background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <AgentDot agentId={activeAgent.response.agent_id} size={5} />
                    <span style={{ fontSize: '11px', fontWeight: 500, color: agentConfig.color }}>
                      {agentConfig.name}
                    </span>
                    {i === 0 ? (
                      <span style={{ fontSize: '11px', color: '#6B6460', fontStyle: 'italic', marginLeft: 4 }}>
                        Original take
                      </span>
                    ) : null}
                  </div>
                  <AgentAnswerMarkdown markdown={msg.content} question={originalPrompt} />
                  {messageCopyButton(`msg-${i}`, {
                    role: 'agent',
                    content: msg.content,
                    includeQuestion: i === 0,
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Streaming agent response */}
          {isStreaming && streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '92%', background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <AgentDot agentId={activeAgent.response.agent_id} size={5} />
                  <span style={{ fontSize: '11px', fontWeight: 500, color: agentConfig.color }}>
                    {agentConfig.name}
                  </span>
                </div>
                <AgentAnswerMarkdown markdown={streamingText} />
                <span
                  style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '16px',
                    marginTop: 4,
                    background: 'rgba(107,100,96,0.5)',
                    animation: reducedMotion ? 'none' : 'breathe 1.2s ease-in-out infinite',
                    verticalAlign: 'text-bottom',
                  }}
                />
              </div>
            </div>
          )}

          {/* Streaming indicator when no text yet */}
          {isStreaming && !streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} role="status" aria-live="polite">
                  <span
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: agentConfig.color,
                      animation: reducedMotion ? 'none' : 'breathe 2.4s ease-in-out infinite',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#6B6460', fontStyle: 'italic' }}>Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
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
                fontFamily: 'Georgia, serif',
                color: '#FAF7F2',
                background: '#C4956A',
                border: 'none',
                borderRadius: 999,
                padding: '6px 14px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(44,24,16,0.14)',
              }}
            >
              {isStreaming ? 'Jump to latest · streaming' : 'Jump to latest'}
            </button>
          </div>
        ) : null}
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: '0.75rem',
              padding: '0.75rem',
              background: '#FFFFFF',
              border: '0.5px solid rgba(196,149,106,0.3)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <p style={{ fontSize: '12px', color: '#6B6460', margin: 0, flex: 1, lineHeight: 1.45 }}>{error}</p>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                color: '#A89070',
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id="discuss-prompt"
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
            aria-label={`Message ${agentConfig.name}`}
            title="Press / to focus · Enter to send"
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
            className="discuss-send-btn"
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
