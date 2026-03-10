import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

export function PromptInput({ onSubmit, isLoading }: PromptInputProps) {
  const [prompt, setPrompt] = useState('');

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
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask something and watch four minds respond..."
          className="placeholder:text-text-secondary/60 font-sans"
          style={{ 
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: '15px',
            lineHeight: '1.5',
            color: '#1A1714',
            padding: '14px 0',
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
    </form>
  );
}
