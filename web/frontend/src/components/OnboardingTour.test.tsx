import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingTour, ReplayOnboardingTour } from './OnboardingTour';
import {
  readOnboardingTour,
  dismissOnboardingTour,
  resetOnboardingTour,
  ONBOARDING_TOUR_KEY,
} from '../lib/onboardingTour';

describe('onboardingTour (pure helpers)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns default state for missing storage', () => {
    expect(readOnboardingTour(null)).toEqual({ v: 1, dismissed: false });
  });

  it('returns default state for missing key', () => {
    expect(readOnboardingTour(window.localStorage)).toEqual({ v: 1, dismissed: false });
  });

  it('dismissOnboardingTour writes the dismissed state', () => {
    dismissOnboardingTour(window.localStorage);
    expect(readOnboardingTour(window.localStorage)).toEqual({ v: 1, dismissed: true });
  });

  it('resetOnboardingTour wipes the key', () => {
    dismissOnboardingTour(window.localStorage);
    resetOnboardingTour(window.localStorage);
    expect(window.localStorage.getItem(ONBOARDING_TOUR_KEY)).toBeNull();
  });

  it('survives malformed JSON without throwing', () => {
    window.localStorage.setItem(ONBOARDING_TOUR_KEY, '{not json');
    expect(readOnboardingTour(window.localStorage)).toEqual({ v: 1, dismissed: false });
  });
});

describe('onboardingTour same-tab storage notification', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('dispatches a synthetic storage event on dismissOnboardingTour', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      dismissOnboardingTour(window.localStorage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(ONBOARDING_TOUR_KEY);
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on resetOnboardingTour', () => {
    dismissOnboardingTour(window.localStorage);
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      resetOnboardingTour(window.localStorage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe(ONBOARDING_TOUR_KEY);
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('does not notify when storage is null', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      dismissOnboardingTour(null);
      resetOnboardingTour(null);
      expect(onStorage).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});

describe('OnboardingTour widget', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders the first step on a cold start', async () => {
    render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
  });

  it('does not render when the tour has been dismissed', () => {
    window.localStorage.setItem(
      ONBOARDING_TOUR_KEY,
      JSON.stringify({ v: 1, dismissed: true }),
    );
    render(<OnboardingTour />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('advances through the steps and dismisses on the last Next', async () => {
    render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    const next = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(next);
    expect(screen.getByText(/command palette/i)).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText(/Pick a mood/i)).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText(/Pin the tools/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    await waitFor(() =>
      expect(readOnboardingTour(window.localStorage)).toEqual({ v: 1, dismissed: true }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Skip dismisses without advancing', async () => {
    render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    await waitFor(() =>
      expect(readOnboardingTour(window.localStorage)).toEqual({ v: 1, dismissed: true }),
    );
  });

  it('locks body scroll while open and restores on dismiss', async () => {
    const original = document.body.style.overflow;
    render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    await waitFor(() => expect(document.body.style.overflow).toBe(original));
  });

  it('Escape dismisses the tour', async () => {
    render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(readOnboardingTour(window.localStorage)).toEqual({ v: 1, dismissed: true }),
    );
  });

  it('resets the step cursor on dismiss so a re-shown tour starts at 0', async () => {
    // First mount: advance to step 2 by clicking Next twice.
    const { unmount } = render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    // Dismiss.
    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    await waitFor(() => expect(readOnboardingTour(window.localStorage).dismissed).toBe(true));
    unmount();
    // Reset the dismissal and re-mount — the tour must show step 0, not step 2.
    resetOnboardingTour(window.localStorage);
    render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/1 of 4/)).toBeInTheDocument();
  });

  it('ReplayOnboardingTour clears the dismissed flag and re-opens the tour', async () => {
    // First, dismiss the tour.
    const first = render(<OnboardingTour />);
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    await waitFor(() =>
      expect(readOnboardingTour(window.localStorage).dismissed).toBe(true),
    );
    first.unmount();
    // Mount a fresh OnboardingTour + ReplayOnboardingTour. The tour
    // is currently dismissed so the panel should NOT show. Click
    // Replay → the widget listens for the synthetic storage event
    // and re-opens.
    const { unmount } = render(
      <div>
        <OnboardingTour />
        <ReplayOnboardingTour label="Replay tour" />
      </div>,
    );
    expect(screen.queryByText(/Welcome to the Persona Playground/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Replay onboarding tour/i }));
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Persona Playground/i)).toBeInTheDocument(),
    );
    unmount();
  });
});
