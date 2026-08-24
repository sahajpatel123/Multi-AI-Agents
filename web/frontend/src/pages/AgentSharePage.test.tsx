import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AgentSharePage } from './AgentSharePage';
import { ApiError, getPublicAgentReport, type PublicAgentReport } from '../api';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { downloadJsonFile, downloadMarkdownFile } from '../lib/downloadTextFile';
import track from '../utils/track';

vi.mock('../api', () => ({
  getPublicAgentReport: vi.fn(),
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false, user: null, loading: false })),
}));

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadJsonFile: vi.fn(),
  downloadMarkdownFile: vi.fn(),
}));

vi.mock('../utils/track', () => ({
  default: vi.fn(),
}));

vi.mock('../components/ReadAloudButton', () => ({
  ReadAloudButton: ({
    label = 'Read this take aloud',
    onStart,
  }: {
    label?: string;
    onStart?: () => void;
  }) => (
    <button type="button" aria-label={label} onClick={onStart}>
      {label}
    </button>
  ),
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

function report(overrides: Partial<PublicAgentReport> = {}): PublicAgentReport {
  return {
    token: 'tok_1234567890abcdef',
    title: 'Shareable research',
    question: 'Is this report shareable?',
    answer: 'Yes, with a token and a public page.',
    finalScore: 84,
    finalConfidence: 0.75,
    createdAt: '2026-08-14T10:00:00',
    sharedAt: '2026-08-14T11:00:00',
    ...overrides,
  };
}

function renderShare(token = 'tok_1234567890abcdef') {
  return render(
    <MemoryRouter initialEntries={[`/share/agent/${token}`]}>
      <Routes>
        <Route path="/share/agent/:token" element={<AgentSharePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function NavigateToReport({ token }: { token: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/share/agent/${token}`)}>
      Change report
    </button>
  );
}

describe('AgentSharePage', () => {
  const originalNavigatorShare = navigator.share;
  const originalWindowPrint = window.print;

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalNavigatorShare,
    });
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: originalWindowPrint,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockImplementation(() => ({
      isAuthenticated: false,
      user: null,
      loading: false,
      isLoading: false,
    }));
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    vi.mocked(downloadJsonFile).mockReturnValue(true);
    vi.mocked(downloadMarkdownFile).mockReturnValue(true);
  });

  it('renders a shared report question and answer', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    expect(await screen.findByText('Is this report shareable?')).toBeInTheDocument();
    expect(screen.getByText('Yes, with a token and a public page.')).toBeInTheDocument();
    expect(screen.getByText(/Score 84/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence 75%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run your own research/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read report aloud/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('tracks reading a shared Agent report aloud', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: /read report aloud/i }));

    expect(track).toHaveBeenCalledWith('shared_read_aloud');
  });

  it('falls back to the question as the report title when title is missing', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report({ title: null }));
    renderShare();
    expect(await screen.findByText('Is this report shareable?')).toBeInTheDocument();
    expect(screen.getByText('Full report')).toBeInTheDocument();
  });

  it('shows the unavailable state for revoked or unknown links', async () => {
    vi.mocked(getPublicAgentReport).mockRejectedValueOnce(
      new ApiError('Report not found', 404),
    );
    renderShare('missing-token');
    expect(
      await screen.findByText('This report link is no longer available'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/may have been revoked by its owner/i),
    ).toBeInTheDocument();
  });

  it('distinguishes network failures from revoked links', async () => {
    vi.mocked(getPublicAgentReport).mockRejectedValueOnce(new Error('NetworkError'));
    renderShare('tok_net');
    expect(
      await screen.findByText('Could not load this report'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/check your connection and try again/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/revoked by its owner/i),
    ).not.toBeInTheDocument();
  });

  it('requests the token from the URL', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare('tok_abc');
    await screen.findByText('Is this report shareable?');
    expect(getPublicAgentReport).toHaveBeenCalledWith('tok_abc');
  });

  it('copies the report as markdown to the clipboard', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(await screen.findByText('Report copied')).toBeInTheDocument();
    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('Is this report shareable?'),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('Yes, with a token and a public page.'),
    );
  });

  it('shows an honest error when the clipboard copy fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(await screen.findByText(/could not copy the report/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });

  it('copies the public report URL to the clipboard', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    expect(copyToClipboard).toHaveBeenCalledWith(window.location.href);
  });

  it('shows an honest error when copying the public link fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(
      await screen.findByText(/could not copy the link.*address bar/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link copy failed' })).toBeInTheDocument();
  });

  it('opens the system share sheet for a public report when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(await screen.findByRole('button', { name: 'Share report' }));

    expect(await screen.findByRole('button', { name: 'Shared!' })).toBeInTheDocument();
    expect(share).toHaveBeenCalledWith({
      title: 'Shareable research on Arena',
      text: '"Is this report shareable?" — Shareable research on Arena',
      url: window.location.href,
    });
    expect(track).toHaveBeenCalledWith('response_shared');
  });

  it('keeps Copy link available when the system share sheet fails', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share blocked'));
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(await screen.findByRole('button', { name: 'Share report' }));

    expect(await screen.findByText(/could not open system share/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(track).not.toHaveBeenCalledWith('response_shared');
  });

  it('does not apply a stale share result after navigating to another report', async () => {
    let finishShare: (() => void) | undefined;
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShare = resolve;
        }),
    );
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    vi.mocked(getPublicAgentReport).mockImplementation(async (requestedToken) =>
      report({
        token: requestedToken,
        title: requestedToken === 'tok_next' ? 'Next report' : 'Current report',
        question: requestedToken === 'tok_next' ? 'What comes next?' : 'What is current?',
      }),
    );
    render(
      <MemoryRouter initialEntries={['/share/agent/tok_current']}>
        <Routes>
          <Route path="/share/agent/:token" element={<AgentSharePage />} />
        </Routes>
        <NavigateToReport token="tok_next" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('What is current?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share report' }));
    expect(await screen.findByRole('button', { name: 'Sharing report' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Change report' }));
    expect(await screen.findByText('What comes next?')).toBeInTheDocument();

    await act(async () => {
      finishShare?.();
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Share report' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shared!' })).not.toBeInTheDocument();
    expect(screen.queryByText(/report shared using the system share sheet/i)).not.toBeInTheDocument();
    expect(track).not.toHaveBeenCalledWith('response_shared');
  });

  it('reports failure when the clipboard call throws', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockRejectedValueOnce(new Error('clipboard blocked'));
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(await screen.findByText(/could not copy the report/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });

  it('keeps the copy button disabled while a copy is in flight', async () => {
    let finishCopy: ((ok: boolean) => void) | undefined;
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishCopy = resolve;
        }),
    );
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Copying…' })).toBeDisabled();
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishCopy?.(true);
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Report copied' })).toBeEnabled();
  });

  it('starts a fresh feedback window when the link is copied again', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      renderShare();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const copyLink = () =>
        fireEvent.click(screen.getByRole('button', { name: /^(Copy link|Link copied)$/ }));
      copyLink();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1200));
      copyLink();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
      expect(copyToClipboard).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets copy feedback and clears the error after the feedback window', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
      renderShare();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/could not copy/i);
      act(() => vi.advanceTimersByTime(2900));
      expect(screen.queryByRole('button', { name: 'Copy failed' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloads the report as a markdown file', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
    expect(await screen.findByText('Downloaded')).toBeInTheDocument();
    expect(downloadMarkdownFile).toHaveBeenCalledWith(
      expect.stringContaining('Yes, with a token and a public page.'),
      expect.stringContaining('agent-share-'),
    );
  });

  it('shows an honest error when the download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadMarkdownFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
    expect(await screen.findByText(/could not download the report/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download failed' })).toBeInTheDocument();
  });

  it('downloads a machine-readable JSON report without the share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Download .json' }));
    expect(await screen.findByText('JSON downloaded')).toBeInTheDocument();

    const [content, filename] = vi.mocked(downloadJsonFile).mock.calls[0] ?? [];
    expect(filename).toEqual(expect.stringContaining('agent-share-'));
    expect(JSON.parse(content as string)).toEqual({
      format: 'arena-agent-report',
      version: 1,
      title: 'Shareable research',
      question: 'Is this report shareable?',
      answer: 'Yes, with a token and a public page.',
      finalScore: 84,
      finalConfidence: 0.75,
      createdAt: '2026-08-14T10:00:00',
      sharedAt: '2026-08-14T11:00:00',
    });
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the JSON download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadJsonFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Download .json' }));
    expect(await screen.findByText(/could not download the JSON report/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON download failed' })).toBeInTheDocument();
  });

  it('opens the browser print dialog for a shared report', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh feedback window when the JSON report is downloaded again', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      renderShare();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const downloadJson = () =>
        fireEvent.click(screen.getByRole('button', { name: /^(Download \.json|JSON downloaded)$/ }));
      downloadJson();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: 'JSON downloaded' })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1500));
      downloadJson();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => vi.advanceTimersByTime(1500));

      expect(screen.getByRole('button', { name: 'JSON downloaded' })).toBeInTheDocument();
      expect(downloadJsonFile).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets download feedback and clears the error after the feedback window', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      vi.mocked(downloadMarkdownFile).mockReturnValueOnce(false);
      renderShare();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: 'Download failed' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/could not download/i);
      act(() => vi.advanceTimersByTime(2900));
      expect(
        screen.queryByRole('button', { name: 'Download failed' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces copy and download outcomes through a live status region', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(await screen.findByText(/Report copied to clipboard/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
    expect(await screen.findByText(/Report downloaded as markdown/)).toBeInTheDocument();
  });
});
