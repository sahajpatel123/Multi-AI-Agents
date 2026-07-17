import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PerspectiveComparison } from './PerspectiveComparison';
import * as clipboard from '../lib/clipboard';

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
  vi.restoreAllMocks();
});

const sampleResponses = [
  { agent_id: 'agent_1', name: 'The Analyst', color: '#8C9BAB', oneLiner: 'Build it. The risk-adjusted return is favorable over a 3-year horizon.' },
  { agent_id: 'agent_2', name: 'The Philosopher', color: '#9B8FAA', oneLiner: 'Question the premise. The opportunity cost is rarely acknowledged in these decisions.' },
];

describe('PerspectiveComparison', () => {
  it('renders the question when provided', () => {
    installMatchMedia(false);
    const { getByText } = render(
      <PerspectiveComparison
        responses={sampleResponses}
        question="Should we ship?"
        onClose={() => {}}
      />,
    );
    expect(getByText(/Should we ship/)).toBeInTheDocument();
  });

  it('renders each agent row', () => {
    installMatchMedia(false);
    const { getByText } = render(
      <PerspectiveComparison
        responses={sampleResponses}
        onClose={() => {}}
      />,
    );
    expect(getByText(/The Analyst/)).toBeInTheDocument();
    expect(getByText(/The Philosopher/)).toBeInTheDocument();
  });

  it('renders each verdict content', () => {
    installMatchMedia(false);
    const { container } = render(
      <PerspectiveComparison
        responses={sampleResponses}
        onClose={() => {}}
      />,
    );
    // Verdicts are rendered as markdown — they may be split across
    // multiple elements. Check that the verdict text is somewhere in
    // the rendered DOM.
    expect(container.textContent).toMatch(/Build it/);
    expect(container.textContent).toMatch(/Question the premise/);
  });

  it('clicking the close button fires onClose', () => {
    installMatchMedia(false);
    const onClose = vi.fn();
    const { container } = render(
      <PerspectiveComparison
        responses={sampleResponses}
        onClose={onClose}
      />,
    );
    // Find any button in the dialog (close affordance) and click it.
    const closeButton = container.querySelector('button');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders an empty state when no responses are provided', () => {
    installMatchMedia(false);
    const { container } = render(
      <PerspectiveComparison responses={[]} onClose={() => {}} />,
    );
    // No rows to render — but the overlay itself is still there.
    // The exact empty-state text depends on the implementation;
    // just confirm no agent rows are rendered.
    expect(container.textContent).not.toMatch(/The Analyst/);
  });

  it('copy button calls copyToClipboard', () => {
    installMatchMedia(false);
    const copySpy = vi.spyOn(clipboard, 'copyToClipboard').mockResolvedValue(true);
    const { getByText } = render(
      <PerspectiveComparison
        responses={sampleResponses}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByText(/Copy/i));
    expect(copySpy).toHaveBeenCalled();
  });
});