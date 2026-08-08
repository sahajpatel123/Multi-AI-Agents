import { useId, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import {
  ARENA_PROMPT_MAX_CHARS,
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
} from '../lib/charBudget';

interface FollowUpBarProps {
  /** Fired with the trimmed follow-up when the user sends it. */
  onSubmit: (prompt: string) => void;
  /** Disables the input (e.g. while streaming or when the daily quota is gone). */
  disabled?: boolean;
  /** Tooltip shown when disabled. */
  disabledTitle?: string;
}

/**
 * Compact follow-up composer: asks the whole four-mind panel a new question
 * with the previous round attached as context.
 */
export function FollowUpBar({
  onSubmit,
  disabled = false,
  disabledTitle,
}: FollowUpBarProps) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !disabled;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(clampToMax(trimmed, ARENA_PROMPT_MAX_CHARS));
    setValue('');
  };

  const showBudget =
    value.length >= 80 || value.length >= Math.floor(ARENA_PROMPT_MAX_CHARS * 0.85);

  return (
    <div className="followup-bar" aria-label="Ask the panel a follow-up">
      <div className="followup-bar__row">
        <input
          id={inputId}
          className="followup-bar__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask the panel a follow-up…"
          disabled={disabled}
          maxLength={ARENA_PROMPT_MAX_CHARS}
          aria-label="Follow-up question for all four minds"
        />
        <button
          type="button"
          className={[
            'followup-bar__send',
            canSubmit ? 'followup-bar__send--armed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label="Send follow-up"
          title={
            disabled
              ? disabledTitle || 'Follow-up is unavailable right now'
              : 'Send follow-up to the whole panel'
          }
        >
          <CornerDownLeft width={15} height={15} aria-hidden />
        </button>
      </div>
      <div className="followup-bar__meta">
        {showBudget ? (
          <span
            className={`followup-bar__budget followup-bar__budget--${charBudgetTone(
              value.length,
              ARENA_PROMPT_MAX_CHARS,
            )}`}
            title="Character budget (server max 2000)"
          >
            {charBudgetLabel(value.length, ARENA_PROMPT_MAX_CHARS)}
          </span>
        ) : null}
        <p className="followup-bar__hint">
          Replies to all four minds — the previous round is attached as context.
        </p>
      </div>
    </div>
  );
}
