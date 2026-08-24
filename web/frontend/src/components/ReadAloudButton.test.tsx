import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readableSpeechText, ReadAloudButton } from './ReadAloudButton';

type FakeUtterance = {
  text: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function installSpeechMocks() {
  const utterances: FakeUtterance[] = [];
  const synthesis = {
    cancel: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => utterances.push(utterance)),
  };
  class MockSpeechSynthesisUtterance {
    text: string;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
  return { synthesis, utterances };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readableSpeechText', () => {
  it('removes presentation markup while preserving words and links', () => {
    expect(
      readableSpeechText('**Verdict:** [Ship it](https://example.com)\n\n- Test first.'),
    ).toBe('Verdict: Ship it Test first.');
  });
});

describe('ReadAloudButton', () => {
  it('starts, announces, and stops browser-native speech', () => {
    const { synthesis, utterances } = installSpeechMocks();
    const onStart = vi.fn();
    render(<ReadAloudButton text="**A useful take.**" onStart={onStart} />);

    const button = screen.getByRole('button', { name: /read this take aloud/i });
    fireEvent.click(button);
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].text).toBe('A useful take.');
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    act(() => utterances[0].onend?.());
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    expect(synthesis.speak).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: /stop reading/i }));
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  it('cancels speech when the response is replaced or unmounted', () => {
    const { synthesis } = installSpeechMocks();
    const { rerender, unmount } = render(<ReadAloudButton text="First take" />);
    fireEvent.click(screen.getByRole('button', { name: /read this take aloud/i }));
    rerender(<ReadAloudButton text="Second take" />);
    // The first cancel belongs to starting speech; the second stops it when
    // the card's response is replaced.
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: /read this take aloud/i }));
    unmount();
    expect(synthesis.cancel).toHaveBeenCalledTimes(4);
  });

  it('disables itself when speech synthesis is unavailable', () => {
    render(<ReadAloudButton text="A take" />);
    expect(screen.getByRole('button', { name: /read this take aloud/i })).toBeDisabled();
  });

  it('returns to idle when the browser rejects a speech request', () => {
    const { synthesis } = installSpeechMocks();
    synthesis.speak.mockImplementationOnce(() => {
      throw new Error('speech unavailable');
    });
    const onStart = vi.fn(() => {
      throw new Error('analytics unavailable');
    });
    render(<ReadAloudButton text="A take that should still recover." onStart={onStart} />);

    const button = screen.getByRole('button', { name: /read this take aloud/i });
    fireEvent.click(button);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAccessibleName('Read this take aloud');
  });

  it('queues long responses one bounded chunk at a time', () => {
    const { synthesis, utterances } = installSpeechMocks();
    const text = Array.from(
      { length: 12 },
      (_, index) => `Sentence ${index} explains why this report matters.`,
    ).join(' ');
    const normalizedText = readableSpeechText(text);
    render(<ReadAloudButton text={text} />);

    fireEvent.click(screen.getByRole('button', { name: /read this take aloud/i }));
    expect(synthesis.speak).toHaveBeenCalledTimes(1);

    let index = 0;
    while (index < 100 && index < utterances.length) {
      act(() => utterances[index].onend?.());
      index += 1;
    }

    expect(index).toBeGreaterThan(1);
    expect(utterances.every((utterance) => utterance.text.length <= 240)).toBe(true);
    expect(utterances.map((utterance) => utterance.text).join(' ')).toBe(normalizedText);
    expect(synthesis.speak).toHaveBeenCalledTimes(index);
    expect(screen.getByRole('button', { name: /read this take aloud/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('does not resume a queued report after the user stops it', () => {
    const { synthesis, utterances } = installSpeechMocks();
    const text = Array.from({ length: 12 }, (_, index) => `Sentence ${index} is long enough.`).join(' ');
    render(<ReadAloudButton text={text} />);

    fireEvent.click(screen.getByRole('button', { name: /read this take aloud/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop reading/i }));
    act(() => utterances[0].onend?.());

    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /read this take aloud/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('finishes cleanup when the browser cancel operation throws', () => {
    const { synthesis } = installSpeechMocks();
    render(<ReadAloudButton text="A take" />);
    const button = screen.getByRole('button', { name: /read this take aloud/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    synthesis.cancel.mockImplementation(() => {
      throw new Error('cancel unavailable');
    });
    fireEvent.click(screen.getByRole('button', { name: /stop reading/i }));

    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
});
