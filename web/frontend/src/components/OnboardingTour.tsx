import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import {
  readOnboardingTour,
  dismissOnboardingTour,
  resetOnboardingTour,
} from '../lib/onboardingTour';

const STORAGE_KEY = 'arena:persona-playground:onboarding-tour:v1';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const state = readOnboardingTour(window.localStorage);
    if (!state.dismissed) {
      setOpen(true);
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) {
        const next = readOnboardingTour(window.localStorage);
        if (next.dismissed) {
          setOpen(false);
          setStep(0);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Lock body scroll while the tour is open and focus the Next
  // button so keyboard users land inside the dialog.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => nextBtnRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  // Focus trap + Escape handler while the tour is open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => {
        if (el.hasAttribute('disabled')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const dismiss = useCallback(() => {
    if (typeof window === 'undefined') return;
    dismissOnboardingTour(window.localStorage);
    setOpen(false);
    setStep(0);
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
        ref={panelRef}
        className="ppg-tour__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppg-tour-title"
        aria-describedby="ppg-tour-body"
        aria-live="polite"
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
              ref={nextBtnRef}
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

/**
 * "Replay tour" affordance — clears the dismissed flag so the
 * OnboardingTour widget (mounted on the same page) re-opens. Pair
 * it next to the "Press ? for shortcuts" hint in the hero.
 */
export function ReplayOnboardingTour({ label = 'Replay tour' }: { label?: string }) {
  return (
    <button
      type="button"
      className="ppg-hero__shortcut-btn"
      onClick={() => {
        if (typeof window === 'undefined') return;
        resetOnboardingTour(window.localStorage);
        // The widget listens for the same-tab storage event and
        // will re-open on the next render. Fallback: dispatch a
        // fake storage event so same-tab listeners refresh now.
        try {
          window.dispatchEvent(
            new StorageEvent('storage', {
              key: 'arena:persona-playground:onboarding-tour:v1',
              newValue: null,
            }),
          );
        } catch {
          /* jsdom / locked-down iframes — widget will refresh on reload */
        }
      }}
      aria-label="Replay onboarding tour"
    >
      {label}
    </button>
  );
}

export default OnboardingTour;