import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { streamDiscuss } from '../api';
import type { Persona } from '../data/personas';
import type { ScoredAgent } from '../types';
import { DiscussMode } from './DiscussMode';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, streamDiscuss: vi.fn() };
});

const { MOCK_PANEL } = vi.hoisted(() => {
  const MOCK_PANEL: Persona[] = [
    {
      id: 'analyst',
      name: 'The Analyst',
      color: '#8C9BAB',
      bgTint: '#EEF0F2',
      quote: 'I find the flaw in everything.',
      temperature: 0.2,
      description: 'Stress-tests every claim.',
      locked: false,
      slot: 1,
    },
    {
      id: 'philosopher',
      name: 'The Philosopher',
      color: '#9B8FAA',
      bgTint: '#F0EDF2',
      quote: 'I question the premise first.',
      temperature: 0.7,
      description: 'Never answers the question asked.',
      locked: false,
      slot: 2,
    },
    {
      id: 'pragmatist',
      name: 'The Pragmatist',
      color: '#8AA899',
      bgTint: '#EDF2EF',
      quote: 'I only care what actually works.',
      temperature: 0.5,
      description: 'Cuts through theory.',
      locked: false,
      slot: 3,
    },
    {
      id: 'skeptic',
      name: 'The Skeptic',
      color: '#C9A27E',
      bgTint: '#F2EDE8',
      quote: 'Prove it.',
      temperature: 0.8,
      description: 'Demands evidence.',
      locked: false,
      slot: 4,
    },
  ];
  return { MOCK_PANEL };
});

vi.mock('../context/PanelContext', () => ({
  usePanel: () => ({ panel: MOCK_PANEL }),
}));

const analyst: ScoredAgent = {
  response: {
    agent_id: 'agent_1',
    agent_number: 1,
    verdict: 'Ship the smallest honest slice.',
    one_liner: 'Ship it.',
    confidence: 0.9,
    key_assumption: 'Users want speed over polish.',
    timestamp: new Date().toISOString(),
  },
  score: 95,
  is_winner: true,
};

const philosopher: ScoredAgent = {
  response: {
    agent_id: 'agent_2',
    agent_number: 2,
    verdict: 'Question the premise first.',
    one_liner: 'Is shipping the right question?',
    confidence: 0.8,
    key_assumption: 'The goal is not speed.',
    timestamp: new Date().toISOString(),
  },
  score: 88,
  is_winner: false,
};

const emptyTake: ScoredAgent = {
  response: {
    ...analyst.response,
    verdict: '',
    one_liner: '',
  },
  score: 95,
  is_winner: true,
};

const streamDiscussMock = vi.mocked(streamDiscuss);

function installClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

function renderDiscuss(activeAgent: ScoredAgent = analyst) {
  return render(
    <DiscussMode
      originalPrompt="Should we ship today?"
      activeAgent={activeAgent}
      allResponses={[analyst, philosopher]}
      sessionId="s1"
      onExit={vi.fn()}
      onSwitchAgent={vi.fn()}
    />,
  );
}

describe('DiscussMode thread shortcuts (Shift+C / Shift+D)', () => {
  beforeEach(() => {
    streamDiscussMock.mockReset();
    // jsdom has no scrollIntoView; the thread's auto-scroll calls it from a
    // deferred timer, so stub it to keep the component (and tests) quiet.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    // Tests append their own aria-modal probe element; remove leftovers so a
    // later test never inherits a "modal is open" guard from an earlier one.
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach((el) => el.remove());
  });

  it('copies the seeded 1-on-1 thread as markdown with Shift+C', async () => {
    const writeText = installClipboard();
    renderDiscuss();

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0][0] as string;
    expect(md).toContain('# Arena Discuss — The Analyst');
    expect(md).toContain('Should we ship today?');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Shared from Arena Discuss');
  });

  it('downloads the thread as markdown with Shift+D', async () => {
    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = originalCreate('a') as HTMLAnchorElement;
        el.click = clickSpy;
        return el;
      }
      return originalCreate(tag);
    });
    renderDiscuss();

    fireEvent.keyDown(window, { key: 'd', shiftKey: true });
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^discuss-.*\.md$/);
  });

  it('ignores Shift+C/D while a reply is streaming', async () => {
    const writeText = installClipboard();
    streamDiscussMock.mockImplementation(() => new Promise<void>(() => {}));
    renderDiscuss();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'What is the risk?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send message to/i }));
    await waitFor(() => expect(streamDiscussMock).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not hijack Shift+letters while typing a message', async () => {
    const writeText = installClipboard();
    renderDiscuss();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'C', shiftKey: true });
    fireEvent.keyDown(input, { key: 'D', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('yields to an open aria modal', async () => {
    const writeText = installClipboard();
    renderDiscuss();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('refuses to copy a contentless thread instead of faking success', async () => {
    const writeText = installClipboard();
    renderDiscuss(emptyTake);

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });

  it('clears stale copy feedback when switching minds', async () => {
    const writeText = installClipboard();
    const { rerender } = renderDiscuss(analyst);

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument(),
    );

    rerender(
      <DiscussMode
        originalPrompt="Should we ship today?"
        activeAgent={philosopher}
        allResponses={[analyst, philosopher]}
        sessionId="s1"
        onExit={vi.fn()}
        onSwitchAgent={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy thread' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
