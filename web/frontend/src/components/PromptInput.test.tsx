import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { improvePrompt } from '../api';
import { PromptInput } from './PromptInput';

vi.mock('../api', () => ({
  improvePrompt: vi.fn(),
}));

const mockedImprovePrompt = vi.mocked(improvePrompt);

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

  it('exposes an accessible send control label', () => {
    render(<PromptInput onSubmit={() => {}} isLoading={false} />);
    const send = screen.getByRole('button', { name: /enter a prompt to send/i });
    expect(send).toBeDisabled();
  });

  it('marks the form busy while loading', () => {
    const { container } = render(<PromptInput onSubmit={() => {}} isLoading />);
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
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

  it('hides the polish control when polishEnabled is not set', () => {
    render(<PromptInput onSubmit={() => {}} isLoading={false} />);
    expect(
      screen.queryByRole('button', { name: /polish prompt with ai/i }),
    ).toBeNull();
  });

  it('keeps the polish control disabled without content', () => {
    render(<PromptInput onSubmit={() => {}} isLoading={false} polishEnabled />);
    const polish = screen.getByRole('button', { name: /polish prompt with ai/i });
    expect(polish).toBeDisabled();
  });

  it('polishes the prompt and replaces the textarea value', async () => {
    mockedImprovePrompt.mockResolvedValueOnce({
      original_prompt: 'tell me about x',
      improved_prompt: 'What are the trade-offs of x?',
      refined: true,
      note: 'Made the ask specific.',
    });
    render(<PromptInput onSubmit={() => {}} isLoading={false} polishEnabled />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'tell me about x' } });
    fireEvent.click(screen.getByRole('button', { name: /polish prompt with ai/i }));

    await waitFor(() => {
      expect(textarea.value).toBe('What are the trade-offs of x?');
    });
    expect(mockedImprovePrompt).toHaveBeenCalledWith('tell me about x');
    expect(screen.getByRole('status')).toHaveTextContent(/made the ask specific/i);
  });

  it('keeps the prompt when the polish service declines', async () => {
    mockedImprovePrompt.mockResolvedValueOnce({
      original_prompt: 'keep me',
      improved_prompt: 'keep me',
      refined: false,
      note: 'Could not improve this prompt — it was left unchanged.',
    });
    render(<PromptInput onSubmit={() => {}} isLoading={false} polishEnabled />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: /polish prompt with ai/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/unchanged/i);
    });
    expect(textarea.value).toBe('keep me');
  });

  it('keeps the prompt and shows a notice when the API fails', async () => {
    mockedImprovePrompt.mockRejectedValueOnce(new Error('boom'));
    render(<PromptInput onSubmit={() => {}} isLoading={false} polishEnabled />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hold me' } });
    fireEvent.click(screen.getByRole('button', { name: /polish prompt with ai/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/unavailable/i);
    });
    expect(textarea.value).toBe('hold me');
  });

  it('disables the polish control while polishing', async () => {
    let resolvePolish!: (value: {
      original_prompt: string;
      improved_prompt: string;
      refined: boolean;
      note?: string;
    }) => void;
    mockedImprovePrompt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePolish = resolve;
        }),
    );
    render(<PromptInput onSubmit={() => {}} isLoading={false} polishEnabled />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'pending' } });
    const polish = screen.getByRole('button', { name: /polish prompt with ai/i });
    fireEvent.click(polish);
    expect(polish).toBeDisabled();

    await act(async () => {
      resolvePolish({
        original_prompt: 'pending',
        improved_prompt: 'sharpened',
        refined: true,
      });
    });
    await waitFor(() => {
      expect(textarea.value).toBe('sharpened');
    });
  });

  it('ArrowUp fills the most recent prompt when the box is empty', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        history={['newest', 'older']}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('newest');
  });

  it('ArrowUp again walks to older prompts', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        history={['newest', 'older']}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('older');
  });

  it('ArrowDown restores the draft after stepping into history', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        history={['newest', 'older']}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'my draft' } });
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('newest');
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(textarea.value).toBe('my draft');
  });

  it('ArrowUp recalls history even when the caret is mid-text', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        history={['newest']}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'mid text' } });
    textarea.setSelectionRange(3, 3);
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('newest');
  });

  it('ArrowUp with a modifier key does not trigger history', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        history={['newest']}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'ArrowUp', metaKey: true });
    expect(textarea.value).toBe('');
  });

  it('ArrowDown without history is a no-op', () => {
    render(<PromptInput onSubmit={() => {}} isLoading={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(textarea.value).toBe('');
  });

  it('editing after a history step starts a fresh walk from the new draft', () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isLoading={false}
        history={['newest', 'older']}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('newest');

    fireEvent.change(textarea, { target: { value: 'edited newest' } });
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('newest');

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(textarea.value).toBe('edited newest');
  });
});
