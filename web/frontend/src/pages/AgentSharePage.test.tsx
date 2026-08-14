import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AgentSharePage } from './AgentSharePage';
import { ApiError, getPublicAgentReport, type PublicAgentReport } from '../api';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';

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
  downloadMarkdownFile: vi.fn(),
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

describe('AgentSharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockImplementation(() => ({
      isAuthenticated: false,
      user: null,
      loading: false,
      isLoading: false,
    }));
    vi.mocked(copyToClipboard).mockResolvedValue(true);
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
});
