import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingTour } from './OnboardingTour';
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
});