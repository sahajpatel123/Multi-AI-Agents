import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { SessionCard } from './SessionCard';

const AGENT = 'agent_1';

describe('SessionCard', () => {
  it('renders the prompt text', () => {
    const { getByText } = render(
      <SessionCard
        prompt="Should we ship this feature?"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(getByText(/Should we ship this feature/)).toBeInTheDocument();
  });

  it('fires onClick when the card body is clicked', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={onClick}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Open session/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets aria-pressed to true when active', () => {
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={true}
        onClick={() => {}}
      />,
    );
    expect(getByRole('button', { name: /Open session/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sets aria-pressed to false when inactive', () => {
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(getByRole('button', { name: /Open session/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('does not show delete button when onDelete is not provided', () => {
    const { queryByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(queryByRole('button', { name: /Delete session/ })).toBeNull();
  });

  it('fires onDelete without firing onClick', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={onClick}
        onDelete={onDelete}
      />,
    );
    const card = getByRole('button', { name: /Open session/ }).parentElement!;
    fireEvent.mouseEnter(card);
    fireEvent.click(getByRole('button', { name: /Delete session/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders message count when provided', () => {
    const { getByText } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        messageCount={5}
      />,
    );
    expect(getByText(/5 msg/)).toBeInTheDocument();
  });

  it('omits message count when zero', () => {
    const { queryByText } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        messageCount={0}
      />,
    );
    expect(queryByText(/msg/)).toBeNull();
  });

  it('shows "just now" for current timestamps', () => {
    const { getByText } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(getByText(/just now/)).toBeInTheDocument();
  });

  it('renders minutes-ago for recent timestamps', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { getByText } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={fiveMinAgo}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(getByText(/5m ago/)).toBeInTheDocument();
  });

  it('renders empty string for invalid timestamps', () => {
    const { container } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp="not-a-date"
        isActive={false}
        onClick={() => {}}
      />,
    );
    // No "NaNm ago" should leak — the helper guards against invalid input.
    expect(container.textContent).not.toMatch(/NaN/);
  });
});