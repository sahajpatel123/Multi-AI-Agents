import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { streamDebateRound } from '../api';
import type { Persona } from '../data/personas';
import type { DebateRoundResponse, ScoredAgent } from '../types';
import { DebateMode } from './DebateMode';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, streamDebateRound: vi.fn() };
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

const challengedAgent: ScoredAgent = {
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

const roundResult: DebateRoundResponse = {
  request_id: 'debate-1',
  round_number: 1,
  challenged_agent_id: 'agent_1',
  reactions: [
    {
      agent_id: 'agent_2',
      agent_number: 2,
      content: 'Measure first.',
      stance: 'pushback',
      timestamp: new Date().toISOString(),
    },
  ],
  debate_history: [],
  session_id: 's1',
};

const streamDebateRoundMock = vi.mocked(streamDebateRound);

function installClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

function renderDebate() {
  return render(
    <DebateMode
      originalPrompt="Should we ship today?"
      challengedAgent={challengedAgent}
      sessionId="s1"
      onExit={vi.fn()}
    />,
  );
}

async function completeFirstRound() {
  streamDebateRoundMock.mockImplementation(async (_params, callbacks) => {
    callbacks.onResult?.(roundResult);
  });
  renderDebate();
  fireEvent.click(screen.getByRole('button', { name: /Start the debate/i }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Copy debate' })).toBeEnabled(),
  );
}

describe('DebateMode thread shortcuts (Shift+C / Shift+D)', () => {
  beforeEach(() => {
    streamDebateRoundMock.mockReset();
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

  it('does nothing when there are no completed rounds', async () => {
    const writeText = installClipboard();
    renderDebate();

    expect(screen.getByRole('button', { name: 'Copy debate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download .md' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    fireEvent.keyDown(window, { key: 'J', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the full transcript as markdown with Shift+C', async () => {
    const writeText = installClipboard();
    await completeFirstRound();

    fireEvent.keyDown(window, { key: 'c', shiftKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0][0] as string;
    expect(md).toContain('# Arena Debate');
    expect(md).toContain('Should we ship today?');
    expect(md).toContain('## Round 1');
    expect(md).toContain('Measure first.');
    expect(md).toContain('Shared from Arena Debate');
  });

  it('downloads the full transcript as markdown with Shift+D', async () => {
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
    await completeFirstRound();

    fireEvent.keyDown(window, { key: 'd', shiftKey: true });
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^debate-.*\.md$/);
  });

  it('copies the full transcript as JSON with Shift+O', async () => {
    const writeText = installClipboard();
    await completeFirstRound();

    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const json = writeText.mock.calls[0][0] as string;
    const data = JSON.parse(json) as {
      export_type: string;
      question: string;
      challenged_agent_name: string;
      round_count: number;
    };
    expect(data.export_type).toBe('debate_transcript');
    expect(data.question).toBe('Should we ship today?');
    expect(data.challenged_agent_name).toBe('The Analyst');
    expect(data.round_count).toBe(1);
  });

  it('downloads the full transcript as JSON with Shift+J', async () => {
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
    await completeFirstRound();

    fireEvent.keyDown(window, { key: 'j', shiftKey: true });
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^debate-.*\.json$/);
  });

  it('ignores thread export shortcuts while a round is streaming', async () => {
    const writeText = installClipboard();
    streamDebateRoundMock.mockImplementation(() => new Promise<void>(() => {}));
    renderDebate();

    fireEvent.click(screen.getByRole('button', { name: /Start the debate/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy debate' })).toBeDisabled(),
    );
    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    fireEvent.keyDown(window, { key: 'J', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not hijack Shift+letters while typing in the interjection box', async () => {
    const writeText = installClipboard();
    await completeFirstRound();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'C', shiftKey: true });
    fireEvent.keyDown(input, { key: 'D', shiftKey: true });
    fireEvent.keyDown(input, { key: 'O', shiftKey: true });
    fireEvent.keyDown(input, { key: 'J', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('yields to an open aria modal', async () => {
    const writeText = installClipboard();
    await completeFirstRound();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    fireEvent.keyDown(window, { key: 'O', shiftKey: true });
    fireEvent.keyDown(window, { key: 'J', shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
  });
});
