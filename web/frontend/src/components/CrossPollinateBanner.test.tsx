import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CrossPollinateBanner } from './CrossPollinateBanner';

describe('CrossPollinateBanner', () => {
  it('renders nothing when sourceTaskId is null', () => {
    const { container } = render(
      <CrossPollinateBanner sourceTaskId={null} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner with default text when sourceTaskId is set', () => {
    const { getByText } = render(
      <CrossPollinateBanner sourceTaskId="task-1" onDismiss={() => {}} />,
    );
    expect(getByText(/four minds will review it/i)).toBeInTheDocument();
    expect(getByText(/cross-pollination/i)).toBeInTheDocument();
  });

  it('includes the intelligence score when provided', () => {
    const { getByText } = render(
      <CrossPollinateBanner
        sourceTaskId="task-1"
        onDismiss={() => {}}
        intelScore={87}
      />,
    );
    // Score is rendered as integer (rounded).
    expect(getByText(/87/)).toBeInTheDocument();
  });

  it('rounds fractional scores to integers', () => {
    const { container } = render(
      <CrossPollinateBanner
        sourceTaskId="task-1"
        onDismiss={() => {}}
        intelScore={87.6}
      />,
    );
    // 87.6 rounds to 88. The raw "87.6" must NOT appear in the DOM.
    expect(container.textContent).toMatch(/88/);
    expect(container.textContent).not.toMatch(/87\.6/);
  });

  it('drops non-finite scores (NaN, Infinity) silently', () => {
    const { getByText, queryByText } = render(
      <CrossPollinateBanner
        sourceTaskId="task-1"
        onDismiss={() => {}}
        intelScore={Number.NaN}
      />,
    );
    // Default text (no score) renders.
    expect(queryByText(/NaN/)).toBeNull();
    expect(getByText(/four minds will review it/i)).toBeInTheDocument();
  });

  it('clicking the dismiss button fires onDismiss', () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(
      <CrossPollinateBanner sourceTaskId="task-1" onDismiss={onDismiss} />,
    );
    fireEvent.click(getByLabelText(/Dismiss cross-pollination notice/));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses role=status + aria-live=polite for AT announcements', () => {
    const { getByRole } = render(
      <CrossPollinateBanner sourceTaskId="task-1" onDismiss={() => {}} />,
    );
    const region = getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('applies polished chrome classes and score pill', () => {
    const { container, getByText } = render(
      <CrossPollinateBanner
        sourceTaskId="task-1"
        onDismiss={() => {}}
        intelScore={91}
      />,
    );
    expect(container.querySelector('.cross-pollinate-banner')).toHaveClass(
      'cross-pollinate-banner--scored',
    );
    expect(container.querySelector('.cross-pollinate-banner__icon')).not.toBeNull();
    expect(getByText(/91\/100/)).toHaveClass('cross-pollinate-banner__score');
    expect(getByText(/cross-pollination/i)).toBeInTheDocument();
  });
});