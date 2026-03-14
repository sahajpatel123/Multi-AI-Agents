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
            background: '#FFFFFF',
            border: '0.5px solid #E0D8D0',
            borderRadius: '999px',
            boxShadow: '0 4px 24px rgba(26,23,20,0.08)',
            padding: '4px 4px 4px 20px',
            gap: '8px',
            transition: 'all 200ms ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#C4956A';
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(196,149,106,0.15)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#E0D8D0';
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(26,23,20,0.08)';
          }}
        >
          {showChallengeWidget && (
            <button
              type="button"
              onClick={onChallengeClick}
              disabled={!isChallengeEnabled}
              aria-label={challengeTitle}
              title={challengeTitle}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'transparent',
                color: '#6B6460',
                border: 'none',
                cursor: isChallengeEnabled ? 'pointer' : 'not-allowed',
                opacity: isChallengeEnabled ? 1 : 0.4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (isChallengeEnabled) e.currentTarget.style.background = '#F0EBE3';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Swords style={{ width: '14px', height: '14px' }} />
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
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
              padding: '14px 0',
              maxHeight: '120px',
              overflowY: 'auto',
              fontFamily: 'inherit',
            }}
            className="placeholder:text-[#6B6460]"
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
            style={{
              flexShrink: 0,
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              background: isLoading ? '#C4956A' : '#1A1714',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: (!prompt.trim() || isLoading) ? 'not-allowed' : 'pointer',
              border: 'none',
              opacity: (!prompt.trim() || isLoading) ? 0.4 : 1,
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (prompt.trim() && !isLoading) e.currentTarget.style.background = '#C4956A';
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = '#1A1714';
            }}
          >
            {isLoading ? (
              <Loader2 style={{ width: '16px', height: '16px', color: '#FAF7F4', animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send style={{ width: '16px', height: '16px', color: '#FAF7F4' }} />
            )}
          </button>
        </div>

      </div>
    </form>
  );
}
