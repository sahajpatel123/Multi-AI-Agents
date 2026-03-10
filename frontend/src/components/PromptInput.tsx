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
    <form onSubmit={handleSubmit} className="w-full max-w-[720px] mx-auto" style={{ margin: '0 auto' }}>
      <div 
        className="flex items-center bg-background border border-border w-full"
        style={{ 
          borderRadius: '999px',
          padding: '0 8px 0 0',
          boxShadow: '0 4px 24px rgba(74, 103, 85, 0.18)',
          maxWidth: '720px',
          margin: '0 auto',
          minHeight: '52px'
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask something and watch four minds respond..."
          className="
            flex-1 bg-transparent text-text-primary placeholder:text-text-secondary/60
            focus:outline-none focus:ring-0
            resize-none overflow-y-auto
            font-sans border-0
          "
          style={{ 
            padding: '12px 52px 12px 24px',
            fontSize: '15px',
            lineHeight: '1.5',
            verticalAlign: 'middle',
            display: 'flex',
            alignItems: 'center',
            minWidth: '0',
            maxHeight: '120px'
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
          className="
            flex items-center justify-center flex-shrink-0
            bg-accent text-white
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:bg-accent/90 transition-colors
          "
          style={{
            position: 'relative',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            marginLeft: '8px',
            alignSelf: 'center'
          }}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </form>
  );
}
