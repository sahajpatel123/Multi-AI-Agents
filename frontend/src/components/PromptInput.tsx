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
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask something and watch four minds respond..."
          className="
            w-full p-4 pr-14 bg-surface border border-border rounded-lg
            text-text-primary placeholder:text-text-secondary/60
            focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
            resize-none min-h-[100px]
            font-sans text-base
          "
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) {
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
      <p className="mt-2 text-xs text-text-secondary">
        Press ⌘ + Enter to submit
      </p>
    </form>
  );
}
