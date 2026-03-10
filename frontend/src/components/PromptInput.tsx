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
    <form onSubmit={handleSubmit} className="w-full max-w-[720px] mx-auto">
      <div 
        className="relative rounded-2xl"
        style={{ boxShadow: '0 4px 24px rgba(74, 103, 85, 0.18)' }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask something and watch four minds respond..."
          className="
            w-full bg-background rounded-2xl
            text-text-primary placeholder:text-text-secondary/60
            focus:outline-none focus:ring-0
            resize-none min-h-[100px]
            font-sans text-base
            border-0
          "
          style={{ padding: '16px 52px 16px 20px' }}
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
            absolute right-3 bottom-3 p-2 rounded-md
            bg-accent text-white
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:bg-accent/90 transition-colors
          "
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </form>
  );
}
