import { Sparkles } from 'lucide-react';

interface FollowUpSuggestionsProps {
  /** Short follow-up questions proposed for the completed round. */
  suggestions: string[];
  /** Where the suggestions came from — LLM or the deterministic fallback. */
  source?: 'llm' | 'fallback';
  /** Fired with the picked suggestion so it can be sent as a follow-up. */
  onPick: (suggestion: string) => void;
  /** Disables the chips (e.g. while streaming or when the quota is gone). */
  disabled?: boolean;
  /** Tooltip shown when disabled. */
  disabledTitle?: string;
}

/**
 * One-click follow-up chips shown after a completed Arena round. Picking a
 * chip sends the question through the same pipeline as the FollowUpBar, with
 * the previous round attached as context. Renders nothing when empty.
 */
export function FollowUpSuggestions({
  suggestions,
  source = 'llm',
  onPick,
  disabled = false,
  disabledTitle,
}: FollowUpSuggestionsProps) {
  if (!suggestions.length) return null;
  return (
    <div className="followup-suggestions" aria-label="Suggested follow-up questions">
      <p className="followup-suggestions__title">
        <Sparkles width={13} height={13} aria-hidden />
        {source === 'llm'
          ? 'Keep digging'
          : 'Keep digging — built-in suggestions'}
      </p>
      <div className="followup-suggestions__chips">
        {suggestions.map((suggestion, index) => (
          <button
            key={`${index}-${suggestion}`}
            type="button"
            className="followup-suggestions__chip"
            onClick={() => onPick(suggestion)}
            disabled={disabled}
            title={
              disabled
                ? disabledTitle || 'Follow-up is unavailable right now'
                : undefined
            }
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
