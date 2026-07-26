import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import {
  readOnboardingTour,
  dismissOnboardingTour,
} from '../lib/onboardingTour';

const STORAGE_KEY = 'arena:persona-playground:onboarding-tour:v1';

interface OnboardingStep {
  readonly title: string;
  readonly body: string;
  readonly hint?: string;
}

const STEPS: readonly OnboardingStep[] = [
  {
    title: 'Welcome to the Persona Playground',
    body: '27 ways to put the Arena minds to work. The hub helps you find the right tool fast — search, jump, or pin your favorites.',
  },
  {
    title: 'Cmd / Ctrl + K opens the command palette',
    body: 'Type a tool name, format, or idea. ↑/↓ to navigate, Enter to jump. Esc to close.',
    hint: 'Shortcut: ⌘ K',
  },
  {
    title: 'Pick a mood for a guided recommendation',
    body: 'Tap "Stuck", "Curious", "Verdict", "Inspired", or "Exploring" and we will surface a tool that fits — plus alternatives you can compare.',
  },
  {
    title: 'Pin the tools you keep coming back to',
    body: 'Each card has a tiny pin toggle. Up to 3 pins live in the bar at the top so they are 1-click away on every visit.',
  },
];

/**
 * First-time overlay walkthrough. Shows once (per browser) the
 * first time the user lands on the hub. Dismissed permanently via
 * "Skip" or "Got it" — never re-shown unless the user clears the
 * storage key. Honors `prefers-reduced-motion` for the entry
 * animation.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const state = readOnboardingTour(window.localStorage);
    if (!state.dismissed) {
      setOpen(true);
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) {
        const next = readOnboardingTour(window.localStorage);
        if (next.dismissed) setOpen(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const dismiss = useCallback(() => {
    if (typeof window === 'undefined') return;
    dismissOnboardingTour(window.localStorage);
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    if (step + 1 >= STEPS.length) {
      dismiss();
      return;
    }
    setStep((s) => s + 1);
  }, [step, dismiss]);

  if (!open) return null;

  const current = STEPS[step];
  if (!current) return null;
  const isLast = step + 1 === STEPS.length;

  return (
    <div className="ppg-tour" role="presentation">
      <div className="ppg-tour__backdrop" aria-hidden="true" />
      <div
        className="ppg-tour__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppg-tour-title"
        aria-describedby="ppg-tour-body"
      >
        <button
          type="button"
          className="ppg-tour__close"
          onClick={dismiss}
          aria-label="Skip tour"
        >
          <X aria-hidden="true" />
        </button>
        <p className="ppg-tour__eyebrow">
          <Sparkles aria-hidden="true" /> {step + 1} of {STEPS.length}
        </p>
        <h2 id="ppg-tour-title" className="ppg-tour__title">
          {current.title}
        </h2>
        <p id="ppg-tour-body" className="ppg-tour__body">
          {current.body}
        </p>
        {current.hint && <p className="ppg-tour__hint">{current.hint}</p>}
        <div className="ppg-tour__row">
          <div className="ppg-tour__dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`ppg-tour__dot${i === step ? ' ppg-tour__dot--on' : ''}`}
              />
            ))}
          </div>
          <div className="ppg-tour__actions">
            <button
              type="button"
              className="ppg-tour__skip"
              onClick={dismiss}
            >
              Skip
            </button>
            <button
              type="button"
              className="ppg-tour__next"
              onClick={next}
            >
              {isLast ? 'Got it' : 'Next'}
              <ArrowRight aria-hidden="true" width={14} height={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;