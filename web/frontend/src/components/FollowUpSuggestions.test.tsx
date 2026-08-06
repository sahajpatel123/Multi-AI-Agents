import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FollowUpSuggestions } from './FollowUpSuggestions';

describe('FollowUpSuggestions', () => {
  const suggestions = [
    'What evidence would overturn the consensus?',
    'Which trade-off matters most here?',
  ];

  it('renders nothing when there are no suggestions', () => {
    const { container } = render(
      <FollowUpSuggestions suggestions={[]} onPick={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per suggestion', () => {
    render(<FollowUpSuggestions suggestions={suggestions} onPick={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: suggestions[0] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: suggestions[1] }),
    ).toBeInTheDocument();
  });

  it('labels the LLM source by default', () => {
    render(<FollowUpSuggestions suggestions={suggestions} onPick={() => {}} />);
    expect(screen.getByText('Keep digging')).toBeInTheDocument();
  });

  it('labels the fallback source when provided', () => {
    render(
      <FollowUpSuggestions
        suggestions={suggestions}
        source="fallback"
        onPick={() => {}}
      />,
    );
    expect(screen.getByText(/offline suggestions/i)).toBeInTheDocument();
  });

  it('fires onPick with the picked suggestion', () => {
    const onPick = vi.fn();
    render(<FollowUpSuggestions suggestions={suggestions} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: suggestions[1] }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(suggestions[1]);
  });

  it('disables chips while disabled', () => {
    const onPick = vi.fn();
    render(
      <FollowUpSuggestions
        suggestions={suggestions}
        onPick={onPick}
        disabled
        disabledTitle="Quota gone"
      />,
    );
    const chips = screen.getAllByRole('button');
    expect(chips.every((chip) => (chip as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: suggestions[0] })).toHaveAttribute(
      'title',
      'Quota gone',
    );
    fireEvent.click(screen.getByRole('button', { name: suggestions[0] }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
