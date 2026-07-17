import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PromptInput } from './PromptInput';

describe('PromptInput', () => {
  it('calls onSubmit with the typed prompt when the form is submitted', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} isLoading={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.submit(textarea.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('Hello world');
  });

  it('trims whitespace before submitting', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} isLoading={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   spaced out   ' } });
    fireEvent.submit(textarea.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('spaced out');
  });

  it('does not submit an empty prompt', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} isLoading={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.submit(textarea.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the textarea after a successful submit', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} isLoading={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A take' } });
    fireEvent.submit(textarea.closest('form')!);
    expect(textarea.value).toBe('');
  });

  it('does not submit when isLoading is true', () => {
    const onSubmit = vi.fn();
    render(<PromptInput onSubmit={onSubmit} isLoading />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'now' } });
    fireEvent.submit(textarea.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the textarea when isLoading is true', () => {
    render(<PromptInput onSubmit={() => {}} isLoading />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();
  });

  it('uses the supplied placeholder', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        placeholder="Ask anything"
      />,
    );
    const textarea = screen.getByPlaceholderText('Ask anything');
    expect(textarea).not.toBeNull();
  });

  it('applies presetPrompt on mount and tracks presetPromptNonce updates', () => {
    const { rerender } = render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        presetPrompt="First preset"
        presetPromptNonce={1}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('First preset');

    // New nonce with the same text — should not re-apply.
    rerender(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        presetPrompt="First preset"
        presetPromptNonce={1}
      />,
    );
    expect(textarea.value).toBe('First preset');

    // New nonce with new text — should overwrite.
    rerender(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        presetPrompt="Second preset"
        presetPromptNonce={2}
      />,
    );
    expect(textarea.value).toBe('Second preset');
  });
});