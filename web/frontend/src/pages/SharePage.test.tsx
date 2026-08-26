import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { SharePage } from './SharePage';
import { useAuth } from '../hooks/useAuth';
import { copyMarkdownToClipboard, copyToClipboard } from '../lib/clipboard';
import { SHARED_PROMPT_STORAGE_KEY } from '../lib/sharePrompt';

const {
  downloadCsvFileMock,
  downloadJsonFileMock,
  downloadMarkdownFileMock,
  copyToClipboardMock,
  navigateMock,
  setRedirectIntentMock,
  trackMock,
} = vi.hoisted(() => ({
  downloadCsvFileMock: vi.fn(() => true),
  downloadJsonFileMock: vi.fn(() => true),
  downloadMarkdownFileMock: vi.fn(() => true),
  copyToClipboardMock: vi.fn().mockResolvedValue(true),
  navigateMock: vi.fn(),
  setRedirectIntentMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../utils/redirectIntent', () => ({
  setRedirectIntent: (path: string) => setRedirectIntentMock(path),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: false,
    user: null,
    loading: false,
    isLoading: false,
  })),
}));

vi.mock('../utils/track', () => ({ default: trackMock }));

vi.mock('../lib/clipboard', () => ({
  copyMarkdownToClipboard: vi.fn().mockResolvedValue(true),
  copyToClipboard: copyToClipboardMock,
}));

vi.mock('../lib/downloadTextFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/downloadTextFile')>();
  return {
    ...actual,
    downloadCsvFile: downloadCsvFileMock,
    downloadJsonFile: downloadJsonFileMock,
    downloadMarkdownFile: downloadMarkdownFileMock,
  };
});

vi.mock('../components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

function renderShare(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/share${search}`]}>
      <Routes>
        <Route path="/share" element={<SharePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function ChangeShare({ search }: { search: string }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <button type="button" onClick={() => setSearchParams(new URLSearchParams(search))}>
      Change share
    </button>
  );
}

describe('SharePage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    navigateMock.mockClear();
    setRedirectIntentMock.mockClear();
    trackMock.mockClear();
    downloadCsvFileMock.mockClear();
    downloadCsvFileMock.mockReturnValue(true);
    downloadJsonFileMock.mockClear();
    downloadJsonFileMock.mockReturnValue(true);
    downloadMarkdownFileMock.mockClear();
    downloadMarkdownFileMock.mockReturnValue(true);
    copyToClipboardMock.mockClear();
    copyToClipboardMock.mockResolvedValue(true);
    vi.mocked(copyMarkdownToClipboard).mockClear();
    vi.mocked(copyMarkdownToClipboard).mockResolvedValue(true);
    vi.mocked(useAuth).mockImplementation(() => ({
      isAuthenticated: false,
      user: null,
      loading: false,
      isLoading: false,
    }));
  });

  it('shows empty state when params are missing', () => {
    renderShare('');
    expect(screen.getByText(/share link is empty or expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try arena/i })).toBeInTheDocument();
  });

  it('renders shared take content from query params', () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);
    expect(screen.getByText('The Analyst')).toBeInTheDocument();
    expect(screen.getByText('Should I ship today?')).toBeInTheDocument();
    expect(screen.getByText('Ship the smallest honest slice.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try this in arena/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read this take aloud/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy take/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy answer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ save pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download \.json/i })).toBeInTheDocument();
  });

  it('downloads a structured JSON payload for a single shared take', () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the **smallest** honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /download \.json/i }));

    expect(downloadJsonFileMock).toHaveBeenCalledTimes(1);
    const [content, filename] = downloadJsonFileMock.mock.calls[0] as [string, string];
    expect(JSON.parse(content)).toMatchObject({
      schema_version: 1,
      kind: 'take',
      agent: { id: 'agent_1', name: 'The Analyst' },
      response: 'Ship the **smallest** honest slice.',
    });
    expect(filename).toBe('arena-share-The Analyst');
  });

  it('downloads a spreadsheet-ready CSV for a shared round', () => {
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&winner=philosopher' +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.') +
      '&t1=' +
      encodeURIComponent('philosopher|87|Enough is when desire ends.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /download \.csv/i }));

    expect(downloadCsvFileMock).toHaveBeenCalledTimes(1);
    const [content, filename] = downloadCsvFileMock.mock.calls[0] as [string, string];
    expect(content).toContain('\uFEFF"prompt","agent_id","agent_name","score","winner"');
    expect(content).toContain('"Should we ship today?","analyst","The Analyst","84","no"');
    expect(content).toContain('"Should we ship today?","philosopher","The Philosopher","87","yes"');
    expect(filename).toBe('arena-share-round');
    expect(screen.getByRole('button', { name: /downloaded/i })).toHaveTextContent('Downloaded');
  });

  it('keeps the CSV share URL current when the shared round changes in place', () => {
    const currentSearch =
      '?round=1&prompt=' +
      encodeURIComponent('First question') +
      '&t0=' +
      encodeURIComponent('analyst|84|First answer.');
    const nextSearch =
      '?round=1&prompt=' +
      encodeURIComponent('Second question') +
      '&winner=philosopher' +
      '&t0=' +
      encodeURIComponent('philosopher|91|Second answer.');

    render(
      <MemoryRouter initialEntries={[`/share${currentSearch}`]}>
        <Routes>
          <Route
            path="/share"
            element={
              <>
                <SharePage />
                <ChangeShare search={nextSearch} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /change share/i }));
    fireEvent.click(screen.getByRole('button', { name: /download \.csv/i }));

    const [content] = downloadCsvFileMock.mock.calls[0] as [string, string];
    expect(content).toContain('"Second question","philosopher","The Philosopher","91","yes"');
    expect(content).toContain('"http://localhost:3000/share?round=1&prompt=Second+question');
    expect(content).not.toContain('First+question');
  });

  it('surfaces a shared-round CSV download failure', () => {
    downloadCsvFileMock.mockReturnValueOnce(false);
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /download \.csv/i }));

    expect(screen.getByRole('button', { name: /download failed/i })).toHaveTextContent(
      'Download failed',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not download csv/i);
  });

  it('keeps Markdown and JSON download feedback independent', () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    const markdownButton = screen.getByRole('button', { name: /download \.md/i });
    const jsonButton = screen.getByRole('button', { name: /download \.json/i });

    fireEvent.click(markdownButton);

    expect(markdownButton).toHaveTextContent('Downloaded');
    expect(jsonButton).toHaveTextContent('Download .json');

    fireEvent.click(jsonButton);

    expect(markdownButton).toHaveTextContent('Downloaded');
    expect(jsonButton).toHaveTextContent('Downloaded');
  });

  it('keeps a JSON download failure from changing the Markdown control', () => {
    downloadJsonFileMock.mockReturnValueOnce(false);
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /download \.json/i }));

    expect(screen.getByRole('button', { name: /download failed/i })).toHaveTextContent(
      'Download failed',
    );
    expect(screen.getByRole('button', { name: /download \.md/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not download json/i);
  });

  it('opens the browser print dialog for a shared take', () => {
    const print = vi.fn();
    const originalPrint = window.print;
    Object.defineProperty(window, 'print', { configurable: true, value: print });

    try {
      const qs =
        '?agent=agent_1&prompt=' +
        encodeURIComponent('Should I ship today?') +
        '&response=' +
        encodeURIComponent('Ship the smallest honest slice.');
      renderShare(qs);

      fireEvent.click(screen.getByRole('button', { name: /print \/ save pdf/i }));
      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'print', { configurable: true, value: originalPrint });
    }
  });

  it('copies a single shared answer as Markdown without the take wrapper', async () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the **smallest** honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy answer/i }));

    await waitFor(() =>
      expect(copyMarkdownToClipboard).toHaveBeenCalledWith(
        'Ship the **smallest** honest slice.',
      ),
    );
    expect(screen.getByRole('button', { name: /answer copied/i })).toBeInTheDocument();
  });

  it('copies the question without the surrounding shared take', async () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy question/i }));

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('Should I ship today?'));
    expect(screen.getByRole('button', { name: /question copied/i })).toBeInTheDocument();
  });

  it('surfaces question-copy failures', async () => {
    copyToClipboardMock.mockResolvedValueOnce(false);
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy question/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not copy the question/i);
  });

  it('does not apply a stale question-copy result after navigating to another shared take', async () => {
    let finishCopy: ((ok: boolean) => void) | undefined;
    copyToClipboardMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishCopy = resolve;
        }),
    );
    const currentSearch =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    const nextSearch =
      '?agent=agent_2&prompt=' +
      encodeURIComponent('What should I test next?') +
      '&response=' +
      encodeURIComponent('Test the riskiest assumption.');

    render(
      <MemoryRouter initialEntries={[`/share${currentSearch}`]}>
        <Routes>
          <Route
            path="/share"
            element={
              <>
                <SharePage />
                <ChangeShare search={nextSearch} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy question/i }));
    fireEvent.click(screen.getByRole('button', { name: /change share/i }));
    expect(await screen.findByText('What should I test next?')).toBeInTheDocument();

    await act(async () => {
      finishCopy?.(true);
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: /copy question/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /question copied/i })).not.toBeInTheDocument();
  });

  it('preserves URL escapes inside answer Markdown when copying', async () => {
    const answer = 'Use [the encoded path](https://example.test/files/%20) as written.';
    const qs =
      '?agent=agent_1&response=' +
      encodeURIComponent(answer);
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy answer/i }));

    await waitFor(() => expect(copyMarkdownToClipboard).toHaveBeenCalledWith(answer));
  });

  it('surfaces answer-copy failures', async () => {
    vi.mocked(copyMarkdownToClipboard).mockResolvedValueOnce(false);
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy answer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not copy the answer/i);
  });

  it('offers an answer-only copy control for each shared round take', () => {
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    expect(screen.getByRole('button', { name: /copy the analyst answer/i })).toHaveTextContent(
      'Copy answer',
    );
    expect(screen.queryByRole('button', { name: 'Copy answer' })).not.toBeInTheDocument();
  });

  it('copies an individual shared round take as Markdown', async () => {
    const answer = 'Ship the **smallest** honest slice.';
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&t0=' +
      encodeURIComponent(`analyst|84|${answer}`);
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy the analyst answer/i }));

    await waitFor(() => expect(copyMarkdownToClipboard).toHaveBeenCalledWith(answer));
    expect(screen.getByRole('button', { name: /the analyst answer copied/i })).toHaveTextContent(
      'Answer copied',
    );
  });

  it('offers a winner-only copy action for a shared round', async () => {
    const answer = 'Enough is when the evidence settles.';
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&winner=philosopher' +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.') +
      '&t1=' +
      encodeURIComponent(`philosopher|87|${answer}`);
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy winner answer/i }));

    await waitFor(() => expect(copyMarkdownToClipboard).toHaveBeenCalledWith(answer));
    expect(
      screen.getByRole('button', { name: /winning answer copied/i }),
    ).toHaveTextContent('Winner copied');
  });

  it('does not offer winner copy when the winner is absent from the round', () => {
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&winner=missing' +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    expect(screen.queryByRole('button', { name: /copy winner answer/i })).not.toBeInTheDocument();
  });

  it('prevents duplicate round-take copy requests while clipboard is pending', async () => {
    let finishCopy: ((ok: boolean) => void) | undefined;
    const pendingCopy = new Promise<boolean>((resolve) => {
      finishCopy = resolve;
    });
    vi.mocked(copyMarkdownToClipboard).mockImplementationOnce(() => pendingCopy);
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.') +
      '&t1=' +
      encodeURIComponent('philosopher|87|Enough is when desire ends.');
    renderShare(qs);

    const analystButton = screen.getByRole('button', { name: /copy the analyst answer/i });
    const philosopherButton = screen.getByRole('button', { name: /copy the philosopher answer/i });
    fireEvent.click(analystButton);

    expect(analystButton).toBeDisabled();
    expect(analystButton).toHaveTextContent('Copying…');
    expect(philosopherButton).toBeDisabled();
    fireEvent.click(analystButton);
    fireEvent.click(philosopherButton);
    expect(copyMarkdownToClipboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishCopy?.(true);
      await pendingCopy;
    });

    expect(screen.getByRole('button', { name: /the analyst answer copied/i })).toHaveTextContent(
      'Answer copied',
    );
    expect(analystButton).not.toBeDisabled();
    expect(philosopherButton).not.toBeDisabled();
  });

  it('surfaces individual round take copy failures', async () => {
    vi.mocked(copyMarkdownToClipboard).mockResolvedValueOnce(false);
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /copy the analyst answer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not copy this answer/i);
  });

  it('prints a shared round with a collapsed long question', () => {
    const print = vi.fn();
    const originalPrint = window.print;
    Object.defineProperty(window, 'print', { configurable: true, value: print });

    try {
      const longPrompt = 'p'.repeat(200);
      const qs =
        '?round=1&prompt=' +
        encodeURIComponent(longPrompt) +
        '&t0=' +
        encodeURIComponent('analyst|84|Ship the smallest honest slice.');
      renderShare(qs);

      expect(screen.getByText(longPrompt).className).toContain('is-clamped');
      fireEvent.click(screen.getByRole('button', { name: /print \/ save pdf/i }));
      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'print', { configurable: true, value: originalPrint });
    }
  });

  it('records a shared take listen as an agent event', () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalUtterance = window.SpeechSynthesisUtterance;
    const synthesis = { cancel: vi.fn(), speak: vi.fn() };
    class MockUtterance {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(readonly text: string) {}
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: synthesis,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockUtterance,
    });

    try {
      renderShare(qs);
      const listenButton = screen.getByRole('button', { name: /read this take aloud/i });
      fireEvent.click(listenButton);
      expect(trackMock).toHaveBeenCalledWith('shared_read_aloud', undefined, 'agent_1');
    } finally {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: originalSpeechSynthesis,
      });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        configurable: true,
        value: originalUtterance,
      });
    }
  });

  it('renders a shared round with all takes from round query params', () => {
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&winner=philosopher' +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.') +
      '&t1=' +
      encodeURIComponent('philosopher|87|Enough is when desire ends.');
    renderShare(qs);
    expect(screen.getByText('Four minds.')).toBeInTheDocument();
    expect(screen.getByText('Should we ship today?')).toBeInTheDocument();
    expect(screen.getByText('The Analyst')).toBeInTheDocument();
    expect(screen.getByText('Ship the smallest honest slice.')).toBeInTheDocument();
    expect(screen.getByText('The Philosopher')).toBeInTheDocument();
    expect(screen.getByText('Enough is when desire ends.')).toBeInTheDocument();
    expect(screen.getAllByText(/Arena take/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Arena winner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read this round aloud/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy round/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy the analyst answer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy the philosopher answer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /copy question/i }));
    expect(copyToClipboardMock).toHaveBeenCalledWith('Should we ship today?');
    fireEvent.click(screen.getByRole('button', { name: /download \.json/i }));
    expect(downloadJsonFileMock).toHaveBeenCalledTimes(1);
    const [content] = downloadJsonFileMock.mock.calls[0] as [string, string];
    expect(JSON.parse(content)).toMatchObject({
      kind: 'round',
      winner_agent_id: 'philosopher',
      takes: [
        { agent_id: 'analyst', agent_name: 'The Analyst', score: 84 },
        { agent_id: 'philosopher', agent_name: 'The Philosopher', score: 87 },
      ],
    });
  });

  it('expands and collapses a long shared round prompt', () => {
    const longPrompt = 'p'.repeat(200);
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent(longPrompt) +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    const promptText = screen.getByText(longPrompt);
    expect(promptText.className).toContain('is-clamped');

    fireEvent.click(screen.getByRole('button', { name: /show full question/i }));
    expect(promptText.className).not.toContain('is-clamped');

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(promptText.className).toContain('is-clamped');
  });

  it('shows the empty state instead of a single-take card for a malformed round link', () => {
    renderShare('?round=1&prompt=' + encodeURIComponent('Question only, no takes'));
    expect(screen.getByText(/share link is empty or expired/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy take/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy round/i })).not.toBeInTheDocument();
  });

  it('hands the shared round question to Arena for an authenticated visitor', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: null,
      loading: false,
      isLoading: false,
    });
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /open arena/i }));
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBe('Should we ship today?');
    expect(navigateMock).toHaveBeenCalledWith('/app');
  });

  it('stages the shared take question and sends guests through sign-in', () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /try this in arena/i }));
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBe('Should I ship today?');
    expect(setRedirectIntentMock).toHaveBeenCalledWith('/app');
    expect(navigateMock).toHaveBeenCalledWith('/signin');
  });

  it('does not stage a prompt from an empty share link', () => {
    renderShare('');
    fireEvent.click(screen.getByRole('button', { name: /try arena/i }));
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith('/signin');
  });

  it('clears a stale staged prompt when opening Arena from a prompt-less share', () => {
    sessionStorage.setItem(SHARED_PROMPT_STORAGE_KEY, 'Older question');
    const qs =
      '?agent=agent_1&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);

    fireEvent.click(screen.getByRole('button', { name: /try this in arena/i }));
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBeNull();
    expect(setRedirectIntentMock).toHaveBeenCalledWith('/app');
    expect(navigateMock).toHaveBeenCalledWith('/signin');
  });
});
