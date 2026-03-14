import { useEffect, useRef, useState } from 'react';
import { Loader2, Swords, ArrowUp } from 'lucide-react';

const CYCLING_PLACEHOLDERS = [
  'Ask something and watch four minds respond...',
  'What keeps you up at night? Ask them...',
  'Drop a question. Get four perspectives...',
  'Challenge an idea. See what they think...',
  'What do you actually want to know?',
  'Give them something hard...',
];

// Four agent accent colors — muted to match site palette
const DOT_COLORS = ['#A8B8C8', '#A8C4A4', '#C4A8B8', '#C8B48C'];

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  placeholder?: string;
  presetPrompt?: string;
  presetPromptNonce?: number;
  showChallengeWidget?: boolean;
  onChallengeClick?: () => void;
  isChallengeEnabled?: boolean;
  challengeTitle?: string;
}

export function PromptInput({
  onSubmit,
  isLoading,
  placeholder,
  presetPrompt,
  presetPromptNonce,
  showChallengeWidget = false,
  onChallengeClick,
  isChallengeEnabled = false,
  challengeTitle = 'Challenge',
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderFading, setPlaceholderFading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activePlaceholder = placeholder ?? CYCLING_PLACEHOLDERS[placeholderIndex];

  // Cycle placeholder text every 4 seconds
  useEffect(() => {
    if (placeholder) return;
    const interval = setInterval(() => {
      setPlaceholderFading(true);
      setTimeout(() => {
        setPlaceholderIndex(i => (i + 1) % CYCLING_PLACEHOLDERS.length);
        setPlaceholderFading(false);
      }, 350);
    }, 4000);
    return () => clearInterval(interval);
  }, [placeholder]);

  // Auto-resize textarea to fit content
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  };

  useEffect(() => {
    if (presetPromptNonce === undefined) return;
    setPrompt(presetPrompt || '');
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      autoResize(el);
    });
  }, [presetPrompt, presetPromptNonce]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isLoading) {
      onSubmit(prompt.trim());
      setPrompt('');
      // Reset height after clear
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      });
    }
  };

  const hasContent = Boolean(prompt.trim());

  return (
    <>
      <style>{`
        @keyframes borderFlow {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes dotWave {
          0%, 80%, 100% { transform: scaleY(0.6); opacity: 0.4; }
          40%            { transform: scaleY(1.2); opacity: 1; }
        }
        @keyframes orbPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(196,149,106,0.45); }
          60%       { box-shadow: 0 0 0 6px rgba(196,149,106,0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .arena-textarea {
          scrollbar-width: none;
        }
        .arena-textarea::-webkit-scrollbar {
          display: none;
        }
        .arena-textarea::placeholder {
          transition: opacity 350ms ease, color 200ms ease;
          color: #9A9088;
        }
        .arena-textarea.ph-fade::placeholder {
          opacity: 0;
        }
      `}</style>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          justifyContent: 'center',
          background: 'transparent',
          width: '100%',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'all',
            width: '100%',
            maxWidth: '720px',
          }}
        >
          {/* Gradient-border shell — 1.5px padding creates the animated border */}
          <div
            style={{
              borderRadius: '16px',
              padding: '1.5px',
              background: isFocused
                ? 'linear-gradient(110deg, #C4956A, #D4B896, #A8C4A4, #C4A8B8, #C4956A)'
                : 'linear-gradient(110deg, #D8D0C8, #EDE5DC, #D0D8CC, #DDD4CC)',
              backgroundSize: '300% 300%',
              animation: isFocused ? 'borderFlow 4s ease infinite' : 'none',
              boxShadow: isFocused
                ? '0 8px 40px rgba(196,149,106,0.18), 0 2px 8px rgba(0,0,0,0.07)'
                : '0 4px 20px rgba(26,23,20,0.07), 0 1px 4px rgba(0,0,0,0.04)',
              transition: 'box-shadow 300ms ease',
            }}
          >
            {/* Inner container */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(252, 249, 246, 0.98)',
                backdropFilter: 'blur(20px)',
                borderRadius: '14.5px',
                padding: '0 6px 0 14px',
                gap: '10px',
                minHeight: '46px',
              }}
            >
              {/* Left: four-minds dot cluster OR challenge sword */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  flexShrink: 0,
                }}
              >
                {showChallengeWidget ? (
                  <button
                    type="button"
                    onClick={onChallengeClick}
                    disabled={!isChallengeEnabled}
                    aria-label={challengeTitle}
                    title={challengeTitle}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      background: isChallengeEnabled ? 'rgba(196,149,106,0.1)' : 'transparent',
                      color: isChallengeEnabled ? '#C4956A' : '#B4ACA4',
                      border: 'none',
                      cursor: isChallengeEnabled ? 'pointer' : 'not-allowed',
                      opacity: isChallengeEnabled ? 1 : 0.35,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 180ms ease',
                    }}
                    onMouseEnter={(e) => {
                      if (isChallengeEnabled) e.currentTarget.style.background = 'rgba(196,149,106,0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isChallengeEnabled
                        ? 'rgba(196,149,106,0.1)'
                        : 'transparent';
                    }}
                  >
                    <Swords style={{ width: '13px', height: '13px' }} />
                  </button>
                ) : (
                  /* Four animated bars — like an audio waveform, one per agent mind */
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      height: '16px',
                      opacity: isFocused ? 1 : 0.55,
                      transition: 'opacity 300ms ease',
                    }}
                  >
                    {DOT_COLORS.map((color, i) => (
                      <div
                        key={i}
                        style={{
                          width: '3px',
                          height: '12px',
                          borderRadius: '2px',
                          background: color,
                          animation: isLoading
                            ? `dotWave 1.2s ease-in-out infinite`
                            : isFocused
                            ? `dotWave 2.4s ease-in-out infinite`
                            : 'none',
                          animationDelay: `${i * 0.18}s`,
                          transform: isLoading || isFocused ? undefined : 'scaleY(0.7)',
                          opacity: isLoading || isFocused ? undefined : 0.5,
                          transition: 'transform 300ms ease, opacity 300ms ease',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div
                style={{
                  width: '1px',
                  height: '16px',
                  background: isFocused ? 'rgba(196,149,106,0.25)' : 'rgba(0,0,0,0.08)',
                  flexShrink: 0,
                  borderRadius: '1px',
                  transition: 'background 300ms ease',
                }}
              />

              {/* Textarea — rows=1 + auto-resize → perfect vertical centering */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  autoResize(e.target);
                }}
                placeholder={activePlaceholder}
                className={`arena-textarea${placeholderFading ? ' ph-fade' : ''}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  color: '#1A1714',
                  padding: '0',
                  margin: '13px 0',
                  maxHeight: '100px',
                  overflowY: 'auto',
                  fontFamily: 'inherit',
                  letterSpacing: '0.01em',
                  display: 'block',
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />

              {/* Send orb */}
              <button
                type="submit"
                disabled={!hasContent || isLoading}
                style={{
                  flexShrink: 0,
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: hasContent || isLoading
                    ? 'linear-gradient(140deg, #C4956A 0%, #D4A87C 100%)'
                    : 'transparent',
                  border: hasContent || isLoading
                    ? 'none'
                    : '1.5px solid #E0D8D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: (!hasContent || isLoading) ? 'not-allowed' : 'pointer',
                  transition: 'all 220ms ease',
                  animation: hasContent && !isLoading ? 'orbPulse 2.4s ease-in-out infinite' : 'none',
                  boxShadow: hasContent && !isLoading
                    ? '0 2px 12px rgba(196,149,106,0.5)'
                    : 'none',
                }}
                onMouseEnter={(e) => {
                  if (hasContent && !isLoading) {
                    e.currentTarget.style.transform = 'scale(1.06) translateY(-1px)';
                    e.currentTarget.style.background = 'linear-gradient(140deg, #B8895E 0%, #C9965E 100%)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  if (hasContent && !isLoading) {
                    e.currentTarget.style.background = 'linear-gradient(140deg, #C4956A 0%, #D4A87C 100%)';
                  }
                }}
              >
                {isLoading ? (
                  <Loader2
                    style={{ width: '15px', height: '15px', color: '#FAF7F4', animation: 'spin 1s linear infinite' }}
                  />
                ) : (
                  <ArrowUp
                    style={{ width: '15px', height: '15px', color: hasContent ? '#FAF7F4' : '#C0B8B0' }}
                  />
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
