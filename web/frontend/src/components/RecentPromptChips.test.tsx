import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecentPromptChips } from './RecentPromptChips';
import type { RecentPrompt } from '../lib/recentPrompts';

function prompt(text: string, at: number, pinned = false): RecentPrompt {
  return { text, at, pinned };
}

describe('RecentPromptChips', () => {
  it('renders nothing when there are no recent prompts', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
      />,
    );
    expect(container.querySelector('[role="list"]')).toBeNull();
  });

  it('shows recent prompt chips and reuses a prompt on click', () => {
    const onReuse = vi.fn();
    render(
      <RecentPromptChips
        prompts={[prompt('Should I ship?', 1)]}
        onReuse={onReuse}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reuse recent prompt: should i ship/i }));
    expect(onReuse).toHaveBeenCalledWith('Should I ship?');
  });

  it('removes a prompt through the remove affordance', () => {
    const onRemove = vi.fn();
    render(
      <RecentPromptChips
        prompts={[prompt('Old question', 1)]}
        onReuse={() => {}}
        onRemove={onRemove}
        onClear={() => {}}
        onTogglePin={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove recent prompt: old question/i }));
    expect(onRemove).toHaveBeenCalledWith('Old question');
  });

  it('pins and unpins a prompt', () => {
    const onTogglePin = vi.fn();
    const { rerender } = render(
      <RecentPromptChips
        prompts={[prompt('Keep me', 1)]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={onTogglePin}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /pin recent prompt: keep me/i }));
    expect(onTogglePin).toHaveBeenCalledWith('Keep me', true);

    rerender(
      <RecentPromptChips
        prompts={[prompt('Keep me', 1, true)]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={onTogglePin}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /unpin recent prompt: keep me/i }));
    expect(onTogglePin).toHaveBeenCalledWith('Keep me', false);
  });

  it('clears every recent prompt', () => {
    const onClear = vi.fn();
    render(
      <RecentPromptChips
        prompts={[prompt('Anything', 1)]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={onClear}
        onTogglePin={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /clear all recent prompts/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows pinned prompts ahead of ordinary recents', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[
          prompt('Fresh take', 2),
          prompt('Pinned question', 1, true),
        ]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
      />,
    );
    const labels = Array.from(
      container.querySelectorAll('[role="listitem"] button'),
    )
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label?.startsWith('Reuse recent prompt:'));
    expect(labels[0]).toContain('Pinned question');
    expect(labels[1]).toContain('Fresh take');
  });

  it('respects the chip limit while keeping pinned prompts first', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[
          prompt('One', 4),
          prompt('Two', 3),
          prompt('Three', 2),
          prompt('Pinned', 1, true),
        ]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
        limit={3}
      />,
    );
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /reuse recent prompt: pinned/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reuse recent prompt: three/i })).toBeNull();
  });

  it('never hides a pinned prompt behind the chip limit', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[
          prompt('Pinned A', 4, true),
          prompt('Pinned B', 3, true),
          prompt('Pinned C', 2, true),
          prompt('Pinned D', 1, true),
        ]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
        limit={2}
      />,
    );
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: /reuse recent prompt: pinned d/i }),
    ).toBeInTheDocument();
  });

  it('shows a toggle only when prompts are hidden behind the limit', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[
          prompt('One', 3),
          prompt('Two', 2),
          prompt('Three', 1),
        ]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
        limit={2}
      />,
    );
    expect(
      screen.getByRole('button', { name: /show all recent prompts/i }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  });

  it('omits the toggle when every stored prompt is already visible', () => {
    render(
      <RecentPromptChips
        prompts={[prompt('One', 2), prompt('Two', 1)]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
        limit={2}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /show all recent prompts/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /show fewer recent prompts/i }),
    ).toBeNull();
  });

  it('expands to reveal every stored prompt and collapses again', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[
          prompt('One', 5),
          prompt('Two', 4),
          prompt('Three', 3),
          prompt('Four', 2),
          prompt('Five', 1),
        ]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
        limit={2}
      />,
    );
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2);

    const expand = screen.getByRole('button', { name: /show all recent prompts/i });
    fireEvent.click(expand);
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(5);
    expect(
      screen.getByRole('button', { name: /reuse recent prompt: five/i }),
    ).toBeInTheDocument();
    expect(expand).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: /show fewer recent prompts/i }));
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: /reuse recent prompt: five/i }),
    ).toBeNull();
  });

  it('keeps pinned prompts first when expanded', () => {
    const { container } = render(
      <RecentPromptChips
        prompts={[
          prompt('Fresh', 3),
          prompt('Pinned oldie', 1, true),
        ]}
        onReuse={() => {}}
        onRemove={() => {}}
        onClear={() => {}}
        onTogglePin={() => {}}
        limit={1}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /show all recent prompts/i }));
    const labels = Array.from(
      container.querySelectorAll('[role="listitem"] button'),
    )
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label?.startsWith('Reuse recent prompt:'));
    expect(labels[0]).toContain('Pinned oldie');
    expect(labels[1]).toContain('Fresh');
  });
});
