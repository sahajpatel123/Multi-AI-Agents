import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FollowUpBar } from './FollowUpBar';
import { ARENA_PROMPT_MAX_CHARS } from '../lib/charBudget';

describe('FollowUpBar', () => {
  it('starts with an empty input and a disabled send button', () => {
    render(<FollowUpBar onSubmit={() => {}} />);
    const input = screen.getByRole('textbox', {
      name: /follow-up question for all four minds/i,
    }) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(
      screen.getByRole('button', { name: /send follow-up/i }),
    ).toBeDisabled();
  });

  it('submits the trimmed value and clears the input', () => {
    const onSubmit = vi.fn();
    render(<FollowUpBar onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  and what about the cost?  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send follow-up/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('and what about the cost?');
    expect(input.value).toBe('');
  });

  it('submits on Enter', () => {
    const onSubmit = vi.fn();
    render(<FollowUpBar onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tell me more' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('tell me more');
  });

  it('does not submit while disabled', () => {
    const onSubmit = vi.fn();
    render(<FollowUpBar onSubmit={onSubmit} disabled disabledTitle="Quota gone" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /send follow-up/i })).toBeDisabled();
  });

  it('clamps the submitted prompt to the server max', () => {
    const onSubmit = vi.fn();
    render(<FollowUpBar onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    const overlong = 'x'.repeat(ARENA_PROMPT_MAX_CHARS + 40);
    fireEvent.change(input, { target: { value: overlong } });
    fireEvent.click(screen.getByRole('button', { name: /send follow-up/i }));
    expect(onSubmit).toHaveBeenCalledWith('x'.repeat(ARENA_PROMPT_MAX_CHARS));
  });
});
