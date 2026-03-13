import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Swords } from 'lucide-react';

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
  placeholder = 'Ask something and watch four minds respond...',
  presetPrompt,
  presetPromptNonce,
  showChallengeWidget = false,
  onChallengeClick,
  isChallengeEnabled = false,
  challengeTitle = 'Challenge',
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [isChallengeHovered, setIsChallengeHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (presetPromptNonce === undefined) return;
    setPrompt(presetPrompt || '');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [presetPrompt, presetPromptNonce]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isLoading) {
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  return (
    <form 
      onSubmit={handleSubmit}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '20px 24px 28px 24px',
        background: 'transparent',
        zIndex: 50,
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          pointerEvents: 'all',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          maxWidth: '792px',
          gap: '12px',
        }}
      >
        <div 
          style={{ 
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            maxWidth: '720px',
            minHeight: '54px',
            background: '#FAF7F4',
            border: '1px solid #E0D8D0',
            borderRadius: '999px',
            boxShadow: '0 4px 24px rgba(74, 103, 85, 0.18)',
            padding: '0 8px 0 20px',
            gap: '8px'
          }}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            className="placeholder:text-text-secondary/60 font-sans"
            style={{ 
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: '17px',
              lineHeight: '1',
              color: '#483f36',
              padding: '16px 0 0 0',
              maxHeight: '120px',
              overflowY: 'auto',
              alignSelf: 'center'
            }}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
            style={{
              flexShrink: 0,
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: '#C4956A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
              cursor: 'pointer',
              border: 'none'
            }}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>

        {showChallengeWidget && (
          <button
            type="button"
            onClick={onChallengeClick}
            onMouseEnter={() => setIsChallengeHovered(true)}
            onMouseLeave={() => setIsChallengeHovered(false)}
            disabled={!isChallengeEnabled}
            aria-label={challengeTitle}
            title={challengeTitle}
            style={{
              position: 'relative',
              width: '54px',
              height: '54px',
              flexShrink: 0,
              borderRadius: '999px',
              border: isChallengeHovered
                ? '1px solid rgba(255,255,255,0.68)'
                : '1px solid rgba(176, 151, 126, 0.32)',
              background: 'rgba(250, 247, 244, 0.72)',
              backdropFilter: isChallengeHovered ? 'blur(10px)' : 'blur(0px)',
              boxShadow: isChallengeHovered
                ? '0 10px 24px rgba(176, 151, 126, 0.24), inset 0 1px 0 rgba(255,255,255,0.82)'
                : '0 4px 14px rgba(26, 23, 20, 0.1)',
              transition: 'all 320ms cubic-bezier(0.22, 1, 0.36, 1)',
              transform: isChallengeHovered ? 'translateY(-1px)' : 'translateY(0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isChallengeEnabled ? 'pointer' : 'not-allowed',
              opacity: isChallengeEnabled ? 1 : 0.46,
              overflow: 'hidden',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                opacity: isChallengeHovered ? 1 : 0,
                transition: 'opacity 0.3s ease',
                pointerEvents: 'none',
                background: `linear-gradient(
                  145deg,
                  rgba(255,255,255,0.34) 0%,
                  rgba(255,255,255,0.12) 45%,
                  rgba(255,255,255,0.0) 64%,
                  rgba(176, 151, 126, 0.1) 100%
                )`,
              }}
            />
            <Swords className="w-[18px] h-[18px] text-text-primary/85" />
          </button>
        )}
      </div>
    </form>
  );
}
