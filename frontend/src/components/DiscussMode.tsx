import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { streamDiscuss } from '../api';
import {
  ScoredAgent,
  DiscussChatMessage,
  AGENTS,
} from '../types';

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
  const agentConfig = AGENTS[activeAgent.response.agent_id];

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

  const currentHistory = histories[activeAgent.response.agent_id] || [];

  const flushTokens = useCallback(() => {
    setStreamingText(tokenBuffer.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  // Focus input when agent changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeAgent.response.agent_id]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;

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
        },
        {
          onToken: (data) => {
            tokenBuffer.current += data.token;
          },
          onResult: (data) => {
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
            if (flushTimer.current) clearInterval(flushTimer.current);
            setError(data.detail);
            setIsStreaming(false);
          },
        }
      );
    } catch (err) {
      if (flushTimer.current) clearInterval(flushTimer.current);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsStreaming(false);
    }
  };

  const otherAgents = allResponses.filter(
    (s) => s.response.agent_id !== activeAgent.response.agent_id
  );

  return (
    <div className="flex gap-4 min-h-[60vh]">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onExit}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Arena
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: agentConfig.color }}
            />
            <span className="text-sm font-medium text-text-primary">
              {agentConfig.name}
            </span>
            <span className="text-xs text-text-secondary">1-on-1</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1" style={{ maxHeight: '55vh' }}>
          {/* Agent's original verdict as first message */}
          {currentHistory.length === 0 && !isStreaming && (
            <div className="flex justify-start">
              <div
                className="max-w-[80%] rounded-lg px-4 py-3 border"
                style={{
                  backgroundColor: `${agentConfig.color}08`,
                  borderColor: `${agentConfig.color}25`,
                }}
              >
                <p className="text-sm text-text-primary leading-relaxed">
                  {activeAgent.response.verdict}
                </p>
                <p className="text-xs text-text-secondary mt-2 italic">
                  Original verdict
                </p>
              </div>
            </div>
          )}

          {/* Conversation messages */}
          {currentHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[80%] bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
                  <p className="text-sm text-text-primary">{msg.content}</p>
                </div>
              ) : (
                <div
                  className="max-w-[80%] rounded-lg px-4 py-3 border"
                  style={{
                    backgroundColor: `${agentConfig.color}08`,
                    borderColor: `${agentConfig.color}25`,
                  }}
                >
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Streaming agent response */}
          {isStreaming && streamingText && (
            <div className="flex justify-start">
              <div
                className="max-w-[80%] rounded-lg px-4 py-3 border"
                style={{
                  backgroundColor: `${agentConfig.color}08`,
                  borderColor: `${agentConfig.color}25`,
                }}
              >
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {streamingText}
                  <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-text-secondary/50 animate-pulse align-text-bottom" />
                </p>
              </div>
            </div>
          )}

          {/* Streaming indicator when no text yet */}
          {isStreaming && !streamingText && (
            <div className="flex justify-start">
              <div
                className="rounded-lg px-4 py-3 border"
                style={{
                  backgroundColor: `${agentConfig.color}08`,
                  borderColor: `${agentConfig.color}25`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: agentConfig.color, animationDelay: '0s' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: agentConfig.color, animationDelay: '0.2s' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: agentConfig.color, animationDelay: '0.4s' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 p-3 bg-surface border border-accent/30 rounded-lg">
            <p className="text-xs text-text-secondary">{error}</p>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${agentConfig.name}...`}
            disabled={isStreaming}
            className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-sm
                       text-text-primary placeholder:text-text-secondary/50
                       focus:outline-none focus:border-accent/50
                       disabled:opacity-50
                       transition-colors duration-300"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 bg-surface border border-border rounded-lg
                       text-text-secondary hover:text-text-primary hover:border-accent/50
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-300"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sidebar — other agents as tiles */}
      <div className="hidden md:flex flex-col gap-3 w-52 shrink-0">
        <p className="text-xs text-text-secondary font-medium mb-1">Other agents</p>
        {otherAgents.map((scored) => {
          const other = AGENTS[scored.response.agent_id];
          const hasHistory = (histories[scored.response.agent_id] || []).length > 0;

          return (
            <button
              key={scored.response.agent_id}
              onClick={() => onSwitchAgent(scored.response.agent_id)}
              disabled={isStreaming}
              className="text-left bg-surface border border-border rounded-lg p-3
                         hover:border-text-secondary/30 disabled:opacity-50
                         transition-all duration-300"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: other.color }}
                />
                <span className="text-xs font-medium text-text-primary">
                  {other.name}
                </span>
                {hasHistory && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                )}
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                {scored.response.one_liner}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
