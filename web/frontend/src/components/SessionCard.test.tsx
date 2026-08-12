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

  it('renders a prompt node in place of the plain prompt text', () => {
    const { container, getByRole } = render(
      <SessionCard
        prompt="Roadmap review"
        promptNode={<mark>Roadmap review</mark>}
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(container.querySelector('.session-card__prompt mark')).toHaveTextContent(
      'Roadmap review',
    );
    expect(getByRole('button', { name: /Open session: Roadmap review/ })).toBeInTheDocument();
  });

  it('renders a topic match label in the meta line', () => {
    const { getByText } = render(
      <SessionCard
        prompt="Q3 plan"
        matchTopic="marketing"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        messageCount={3}
      />,
    );
    expect(getByText(/topic: marketing/)).toBeInTheDocument();
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

  it('does not show rename button when onRename is not provided', () => {
    const { queryByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(queryByRole('button', { name: /Rename session/ })).toBeNull();
  });

  it('does not show pin button when onPin is not provided', () => {
    const { queryByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(queryByRole('button', { name: /Pin session/ })).toBeNull();
  });

  it('fires onRename without firing onClick', () => {
    const onClick = vi.fn();
    const onRename = vi.fn();
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={onClick}
        onRename={onRename}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Rename session/ }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onPin without firing onClick', () => {
    const onClick = vi.fn();
    const onPin = vi.fn();
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={onClick}
        onPin={onPin}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Pin session/ }));
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('reflects the pinned state in the pin button', () => {
    const { getByRole, rerender } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        onPin={() => {}}
        pinned
      />,
    );
    expect(getByRole('button', { name: /Unpin session/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    rerender(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        onPin={() => {}}
        pinned={false}
      />,
    );
    expect(getByRole('button', { name: /Pin session/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('disables the pin button while a pin update is in flight', () => {
    const { getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        onPin={() => {}}
        busy
      />,
    );
    const pinButton = getByRole('button', { name: /Pin session/ });
    expect(pinButton).toBeDisabled();
    expect(pinButton).toHaveAttribute('aria-busy', 'true');
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
    // Delete is focusable in the tree (revealed via focus-within / touch).
    fireEvent.click(getByRole('button', { name: /Delete session/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies session-card chrome classes', () => {
    const { container, getByRole } = render(
      <SessionCard
        prompt="hi"
        winnerAgentId={AGENT}
        timestamp={new Date().toISOString()}
        isActive
        onClick={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(container.querySelector('.session-card')).toHaveClass('session-card--active');
    expect(container.querySelector('.session-card')).toHaveClass('session-card--deletable');
    expect(getByRole('button', { name: /Delete session/ })).toHaveClass('session-card__delete');
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

  it('renders an arena-chat label when no winner agent is provided', () => {
    const { getByText } = render(
      <SessionCard
        prompt="Resumable chat"
        timestamp={new Date().toISOString()}
        isActive={false}
        onClick={() => {}}
        messageCount={2}
      />,
    );
    expect(getByText('Arena chat')).toBeInTheDocument();
    expect(getByText(/2 msg/)).toBeInTheDocument();
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
