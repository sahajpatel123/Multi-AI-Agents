import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Swords, ArrowUp } from 'lucide-react';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import {
  ARENA_PROMPT_MAX_CHARS,
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
} from '../lib/charBudget';
import {
  promptBorderAnimation,
  promptDotWaveAnimation,
  promptSendOrbAnimation,
  promptSendSpinnerAnimation,
} from '../lib/promptInputMotion';
import {
  clearPromptDraft,
  loadPromptDraft,
  savePromptDraft,
} from '../lib/promptDraft';

const CYCLING_PLACEHOLDERS = [
  'Ask something and watch four minds respond...',
  'What keeps you up at night? Ask them...',
  'Drop a question. Get four perspectives...',
  'Challenge an idea. See what they think...',
  'What do you actually want to know?',
  'Give them something hard...',
];

// Four agent accent colors — muted to match site palette
const DOT_COLORS = ['#A8B8C8', '#A8C4A4', '#C4A8B8', '#C8B48C'] as const;

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
  /** Soft-disable submit (e.g. daily quota exhausted) while still allowing type/focus. */
  submitBlocked?: boolean;
  submitBlockedTitle?: string;
  /** Fired when the user tries to send while `submitBlocked` (prompt is not cleared). */
  onBlockedAttempt?: () => void;
  /**
   * When set, the prompt is autosaved to localStorage under this key and
   * restored on mount. The caller is responsible for bumping
   * `clearDraftSignal` once the submit succeeds so the draft is cleared
   * from storage; failing to do so preserves the draft for the next mount.
   */
  draftKey?: string;
  /**
   * Bump this (e.g. on submit success) to clear the stored draft. Safe to
   * ignore when `draftKey` is not set.
   */
  clearDraftSignal?: number;
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
  submitBlocked = false,
  submitBlockedTitle,
  onBlockedAttempt,
  draftKey,
  clearDraftSignal,
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderFading, setPlaceholderFading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const budgetId = useId();

  const activePlaceholder = placeholder ?? CYCLING_PLACEHOLDERS[placeholderIndex];

  // Cycle placeholder text — skip timed fades when the user prefers reduced motion.
  useEffect(() => {
    if (placeholder) return;
    if (prefersReducedMotion()) return;
    const fadeMs = motionDuration(350);
    const holdMs = motionDuration(4000);
    if (holdMs === 0) return;
    const interval = setInterval(() => {
      setPlaceholderFading(true);
      window.setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % CYCLING_PLACEHOLDERS.length);
        setPlaceholderFading(false);
      }, fadeMs || 0);
    }, holdMs);
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

  // Restore the draft once on mount — runs before any presetPrompt injection
  // so templates still win, and is skipped entirely when no draftKey was given.
  const draftRestoreDoneRef = useRef(false);
  useEffect(() => {
    if (!draftKey) return;
    if (draftRestoreDoneRef.current) return;
    draftRestoreDoneRef.current = true;
    const stored = loadPromptDraft(draftKey);
    if (!stored) return;
    setPrompt(stored);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      autoResize(el);
    });
  }, [draftKey]);

  // Debounced autosave — typing fast should not hammer localStorage.
  useEffect(() => {
    if (!draftKey) return;
    const handle = window.setTimeout(() => {
      savePromptDraft(draftKey, prompt);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [prompt, draftKey]);

  // Parent bumps clearDraftSignal after a confirmed submit to clear storage.
  // Skip the initial 0 so a freshly mounted input does not wipe a restored draft.
  useEffect(() => {
    if (!draftKey) return;
    if (clearDraftSignal === undefined || clearDraftSignal <= 0) return;
    clearPromptDraft(draftKey);
  }, [clearDraftSignal, draftKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    if (submitBlocked) {
      onBlockedAttempt?.();
      return;
    }
    onSubmit(clampToMax(prompt.trim(), ARENA_PROMPT_MAX_CHARS));
    setPrompt('');
    // Reset height after clear
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  };

  const hasContent = Boolean(prompt.trim());
  const canSubmit = hasContent && !isLoading && !submitBlocked;
  const reducedMotion = prefersReducedMotion();
  const showBudget =
    prompt.length >= 80 || prompt.length >= Math.floor(ARENA_PROMPT_MAX_CHARS * 0.85);
  const budgetTone = charBudgetTone(prompt.length, ARENA_PROMPT_MAX_CHARS);

  const sendLabel = isLoading
    ? 'Sending to Arena…'
    : submitBlocked
      ? submitBlockedTitle || 'Daily limit reached'
      : canSubmit
        ? 'Send to Arena'
        : 'Enter a prompt to send';

  return (
    <form
      className="prompt-input-form"
      onSubmit={handleSubmit}
      aria-busy={isLoading || undefined}
    >
      <div className="prompt-input-shell">
        <div
          className={[
            'prompt-input-wrapper',
            isFocused ? 'prompt-input-wrapper--focused' : '',
            isLoading ? 'prompt-input-wrapper--loading' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            animation: promptBorderAnimation(isFocused, reducedMotion),
          }}
        >
          <div className="prompt-input-inner">
            <div className="prompt-input-leading">
              {showChallengeWidget ? (
                <button
                  type="button"
                  className={[
                    'prompt-input-challenge',
                    isChallengeEnabled ? 'prompt-input-challenge--on' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={onChallengeClick}
                  disabled={!isChallengeEnabled}
                  aria-label={challengeTitle}
                  title={challengeTitle}
                >
                  <Swords width={13} height={13} aria-hidden />
                </button>
              ) : (
                <div
                  className={[
                    'prompt-input-wave',
                    isFocused || isLoading ? 'prompt-input-wave--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden
                >
                  {DOT_COLORS.map((color, i) => (
                    <span
                      key={color}
                      className="prompt-input-wave__bar"
                      style={{
                        background: color,
                        animation: promptDotWaveAnimation(isLoading, isFocused, reducedMotion),
                        animationDelay: reducedMotion ? undefined : `${i * 0.18}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div
              className={[
                'prompt-input-divider',
                isFocused ? 'prompt-input-divider--focused' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            />

            <textarea
              id="arena-prompt"
              ref={textareaRef}
              rows={1}
              value={prompt}
              maxLength={ARENA_PROMPT_MAX_CHARS}
              onChange={(e) => {
                setPrompt(clampToMax(e.target.value, ARENA_PROMPT_MAX_CHARS));
                autoResize(e.target);
              }}
              placeholder={
                submitBlocked
                  ? submitBlockedTitle || 'Daily limit reached — upgrade for more'
                  : activePlaceholder
              }
              className={[
                'prompt-input-textarea',
                'arena-textarea',
                placeholderFading ? 'ph-fade' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Arena prompt"
              aria-describedby={showBudget ? budgetId : undefined}
              title={
                submitBlocked
                  ? submitBlockedTitle
                  : 'Press / anywhere to focus · Enter to send'
              }
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

            {showBudget ? (
              <span
                id={budgetId}
                className={`prompt-input-budget prompt-input-budget--${budgetTone}`}
                aria-live="polite"
                title="Character budget (server max 2000)"
              >
                {charBudgetLabel(prompt.length, ARENA_PROMPT_MAX_CHARS)}
              </span>
            ) : null}

            <button
              type="submit"
              className={[
                'prompt-input-send',
                hasContent || isLoading ? 'prompt-input-send--armed' : '',
                canSubmit ? 'prompt-input-send--ready' : '',
                submitBlocked && hasContent ? 'prompt-input-send--blocked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!hasContent || isLoading}
              aria-label={sendLabel}
              title={
                submitBlocked
                  ? submitBlockedTitle || 'Daily limit reached'
                  : canSubmit
                    ? 'Send to Arena'
                    : undefined
              }
              style={{
                animation: promptSendOrbAnimation(canSubmit, reducedMotion),
              }}
            >
              {isLoading ? (
                <Loader2
                  className="prompt-input-send__icon"
                  width={15}
                  height={15}
                  style={{
                    animation: promptSendSpinnerAnimation(true, reducedMotion),
                  }}
                  aria-hidden
                />
              ) : (
                <ArrowUp
                  className="prompt-input-send__icon"
                  width={15}
                  height={15}
                  aria-hidden
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
