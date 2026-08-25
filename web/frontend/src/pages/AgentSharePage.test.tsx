import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AgentSharePage } from './AgentSharePage';
import { ApiError, getPublicAgentReport, type PublicAgentReport } from '../api';
import { useAuth } from '../hooks/useAuth';
import { copyJsonToClipboard, copyToClipboard } from '../lib/clipboard';
import {
  downloadApaFile,
  downloadBibtexFile,
  downloadChicagoFile,
  downloadCitationBundleFile,
  downloadCsvFile,
  downloadCslJsonFile,
  downloadHarvardFile,
  downloadJsonFile,
  downloadIeeeFile,
  downloadMlaFile,
  downloadMarkdownFile,
  downloadRisFile,
} from '../lib/downloadTextFile';
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
  copyJsonToClipboard: vi.fn(),
  copyToClipboard: vi.fn(),
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadApaFile: vi.fn(),
  downloadBibtexFile: vi.fn(),
  downloadChicagoFile: vi.fn(),
  downloadCitationBundleFile: vi.fn(),
  downloadCsvFile: vi.fn(),
  downloadCslJsonFile: vi.fn(),
  downloadHarvardFile: vi.fn(),
  downloadJsonFile: vi.fn(),
  downloadIeeeFile: vi.fn(),
  downloadMlaFile: vi.fn(),
  downloadMarkdownFile: vi.fn(),
  downloadRisFile: vi.fn(),
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
    sources: [],
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
    sessionStorage.clear();
    vi.mocked(useAuth).mockImplementation(() => ({
      isAuthenticated: false,
      user: null,
      loading: false,
      isLoading: false,
    }));
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    vi.mocked(copyJsonToClipboard).mockResolvedValue(true);
    vi.mocked(downloadJsonFile).mockReturnValue(true);
    vi.mocked(downloadMarkdownFile).mockReturnValue(true);
    vi.mocked(downloadApaFile).mockReturnValue(true);
    vi.mocked(downloadBibtexFile).mockReturnValue(true);
    vi.mocked(downloadChicagoFile).mockReturnValue(true);
    vi.mocked(downloadCitationBundleFile).mockReturnValue(true);
    vi.mocked(downloadCsvFile).mockReturnValue(true);
    vi.mocked(downloadCslJsonFile).mockReturnValue(true);
    vi.mocked(downloadHarvardFile).mockReturnValue(true);
    vi.mocked(downloadIeeeFile).mockReturnValue(true);
    vi.mocked(downloadMlaFile).mockReturnValue(true);
    vi.mocked(downloadRisFile).mockReturnValue(true);
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

  it('renders safe source references and links only web URLs', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({
        sources: [
          'https://example.com/research',
          'A published source',
          'javascript:alert(1)',
          `https://example.com/${'x'.repeat(240)}…`,
        ],
      }),
    );
    renderShare();

    expect(await screen.findByText('Sources consulted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.com/research' })).toHaveAttribute(
      'href',
      'https://example.com/research',
    );
    expect(screen.getByText('A published source')).toBeInTheDocument();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: `https://example.com/${'x'.repeat(240)}…` }),
    ).not.toBeInTheDocument();
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

  it('carries the shared question into Agent Mode, including through sign-in', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: /run your own research/i }));

    expect(sessionStorage.getItem('arena_prefill_question')).toBe(
      'Is this report shareable?',
    );
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

  it('copies a compact citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));

    expect(await screen.findByText('Citation copied')).toBeInTheDocument();
    const [citation] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(citation).toContain(`[Shareable research](<${window.location.href}>)`);
    expect(citation).toContain('Question: Is this report shareable?');
    expect(citation).toContain('Shared: 2026-08-14');
    expect(citation).not.toContain('Yes, with a token and a public page.');
    expect(citation).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));

    expect(await screen.findByText(/could not copy the citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy citation failed' })).toBeInTheDocument();
  });

  it('copies all four prose citations in one labeled bundle', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy all citations' }));

    expect(await screen.findByText('All citations copied')).toBeInTheDocument();
    const [bundle] = vi.mocked(copyToClipboard).mock.calls.at(-1) ?? [];
    expect(bundle).toContain('APA\nArena. (2026, August 14). Shareable research');
    expect(bundle).toContain('Chicago\n');
    expect(bundle).toContain('Harvard\n');
    expect(bundle).toContain('IEEE\n');
    expect(bundle).toContain('MLA\n');
    expect(bundle).not.toContain('Yes, with a token and a public page.');
    expect(bundle).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the citation bundle fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy all citations' }));

    expect(await screen.findByText(/could not copy the citation bundle/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy all failed' })).toBeInTheDocument();
  });

  it('copies an APA citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy APA' }));

    expect(await screen.findByText('APA copied')).toBeInTheDocument();
    const [apa] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(apa).toContain(
      'Arena. (2026, August 14). Shareable research [AI-generated research report]. Arena.',
    );
    expect(apa).not.toContain('Yes, with a token and a public page.');
    expect(apa).not.toContain('tok_1234567890abcdef');
  });

  it('copies an MLA citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy MLA' }));

    expect(await screen.findByText('MLA copied')).toBeInTheDocument();
    const [mla] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(mla).toContain(
      'Arena. “Shareable research.” Arena Agent report, 14 Aug. 2026,',
    );
    expect(mla).not.toContain('Yes, with a token and a public page.');
    expect(mla).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the MLA citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy MLA' }));

    expect(await screen.findByText(/could not copy the MLA citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy MLA failed' })).toBeInTheDocument();
  });

  it('copies an IEEE citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy IEEE' }));

    expect(await screen.findByText('IEEE copied')).toBeInTheDocument();
    const [ieee] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(ieee).toContain(
      'Arena, “Shareable research,” Arena Agent report, Aug. 14, 2026. [Online]. Available:',
    );
    expect(ieee).toContain(window.location.href);
    expect(ieee).not.toContain('Yes, with a token and a public page.');
    expect(ieee).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the IEEE citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy IEEE' }));

    expect(await screen.findByText(/could not copy the IEEE citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy IEEE failed' })).toBeInTheDocument();
  });

  it('shows an honest error when copying the APA citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy APA' }));

    expect(await screen.findByText(/could not copy the APA citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy APA failed' })).toBeInTheDocument();
  });

  it('copies a Harvard citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Harvard' }));

    expect(await screen.findByText('Harvard copied')).toBeInTheDocument();
    const [harvard] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(harvard).toContain(
      'Arena (2026) ‘Shareable research’, Arena Agent report. Available at:',
    );
    expect(harvard).toContain('(Accessed: 14 August 2026)');
    expect(harvard).not.toContain('Yes, with a token and a public page.');
    expect(harvard).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the Harvard citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Harvard' }));

    expect(await screen.findByText(/could not copy the Harvard citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Harvard failed' })).toBeInTheDocument();
  });

  it('copies a Chicago citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Chicago' }));

    expect(await screen.findByText('Chicago copied')).toBeInTheDocument();
    const [chicago] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(chicago).toContain(
      'Arena. “Shareable research.” Arena Agent report. August 14, 2026.',
    );
    expect(chicago).toContain(window.location.href);
    expect(chicago).not.toContain('Yes, with a token and a public page.');
    expect(chicago).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the Chicago citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Chicago' }));

    expect(await screen.findByText(/could not copy the Chicago citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Chicago failed' })).toBeInTheDocument();
  });

  it('copies a BibTeX citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy BibTeX' }));

    expect(await screen.findByText('BibTeX copied')).toBeInTheDocument();
    const [bibtex] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(bibtex).toMatch(/^@online\{arena_shareable_research_20260814_[a-z0-9]+,/m);
    expect(bibtex).toContain('title = {Shareable research}');
    expect(bibtex).toContain('Question: Is this report shareable?');
    expect(bibtex).not.toContain('Yes, with a token and a public page.');
    expect(bibtex).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the BibTeX citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy BibTeX' }));

    expect(await screen.findByText(/could not copy the BibTeX citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy BibTeX failed' })).toBeInTheDocument();
  });

  it('copies a RIS citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy RIS' }));

    expect(await screen.findByText('RIS copied')).toBeInTheDocument();
    const [ris] = vi.mocked(copyToClipboard).mock.calls[0] ?? [];
    expect(ris).toContain('TY  - ELEC');
    expect(ris).toContain('TI  - Shareable research');
    expect(ris).toContain('DA  - 2026/08/14');
    expect(ris).toContain('Question: Is this report shareable?');
    expect(ris).not.toContain('Yes, with a token and a public page.');
    expect(ris).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the RIS citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy RIS' }));

    expect(await screen.findByText(/could not copy the RIS citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy RIS failed' })).toBeInTheDocument();
  });

  it('copies a CSL-JSON citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy CSL-JSON' }));

    expect(await screen.findByText('CSL-JSON copied')).toBeInTheDocument();
    const [cslJson] = vi.mocked(copyJsonToClipboard).mock.calls[0] ?? [];
    const [item] = JSON.parse(cslJson ?? '[]') as Array<Record<string, unknown>>;
    expect(item).toMatchObject({
      type: 'webpage',
      title: 'Shareable research',
      publisher: 'Arena',
    });
    expect(copyJsonToClipboard).toHaveBeenCalledWith(cslJson);
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(cslJson).not.toContain('Yes, with a token and a public page.');
    expect(cslJson).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when copying the CSL-JSON citation fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy CSL-JSON' }));

    expect(await screen.findByText(/try Download \.csl\.json instead/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy CSL-JSON failed' })).toBeInTheDocument();
  });

  it('copies the consulted sources without the full report', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({
        sources: ['https://example.com/research', 'A published source'],
      }),
    );
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy sources' }));

    expect(await screen.findByText('Sources copied')).toBeInTheDocument();
    expect(copyToClipboard).toHaveBeenCalledWith(
      'Sources consulted\n\n1. https://example.com/research\n2. A published source\n',
    );
    expect(copyToClipboard).not.toHaveBeenCalledWith(
      expect.stringContaining('Yes, with a token and a public page.'),
    );
  });

  it('shows an honest error when copying sources fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({ sources: ['https://example.com/research'] }),
    );
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Copy sources' }));

    expect(await screen.findByText(/could not copy the sources/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy sources failed' })).toBeInTheDocument();
  });

  it('downloads consulted sources as escaped CSV without report text', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({
        sources: [
          'https://例子.example/研究',
          'A "quoted", source',
          '=unsafe-source',
        ],
      }),
    );
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download sources .csv' }));

    expect(await screen.findByText('Sources CSV downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadCsvFile).mock.calls[0] ?? [];
    expect(filename).toEqual(expect.stringContaining('agent-share-sources-'));
    expect(content).toBe(
      '\uFEFF"source_number","source"\r\n' +
        '"1","https://例子.example/研究"\r\n' +
        '"2","A ""quoted"", source"\r\n' +
        '"3","\'=unsafe-source"\r\n',
    );
    expect(content).not.toContain('Yes, with a token and a public page.');
  });

  it('shows an honest error when downloading sources as CSV fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({ sources: ['https://example.com/research'] }),
    );
    vi.mocked(downloadCsvFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download sources .csv' }));

    expect(await screen.findByText(/could not download the sources CSV/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sources CSV failed' })).toBeInTheDocument();
  });

  it('does not apply a stale source copy result after navigating to another report', async () => {
    let finishCopy: ((ok: boolean) => void) | undefined;
    vi.mocked(copyToClipboard).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishCopy = resolve;
        }),
    );
    vi.mocked(getPublicAgentReport).mockImplementation(async (requestedToken) =>
      report({
        token: requestedToken,
        title: requestedToken === 'tok_next' ? 'Next report' : 'Current report',
        question: requestedToken === 'tok_next' ? 'What comes next?' : 'What is current?',
        sources: [`https://example.com/${requestedToken}`],
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

    fireEvent.click(screen.getByRole('button', { name: 'Copy sources' }));
    expect(await screen.findByRole('button', { name: 'Copying…' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Change report' }));
    expect(await screen.findByText('What comes next?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy sources' })).toBeEnabled();

    await act(async () => {
      finishCopy?.(true);
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Copy sources' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sources copied' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sources copied to clipboard.')).not.toBeInTheDocument();
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
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({ sources: ['https://example.com/research'] }),
    );
    renderShare();
    await screen.findByText('Is this report shareable?');
    fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
    expect(await screen.findByText('Downloaded')).toBeInTheDocument();
    expect(downloadMarkdownFile).toHaveBeenCalledWith(
      expect.stringContaining('## Sources'),
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
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(
      report({ sources: ['https://example.com/research'] }),
    );
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
      sources: ['https://example.com/research'],
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

  it('downloads the public APA citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download APA' }));

    expect(await screen.findByText('APA downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadApaFile).mock.calls[0] ?? [];
    expect(content).toContain(
      'Arena. (2026, August 14). Shareable research [AI-generated research report]. Arena.',
    );
    expect(content).toContain(window.location.href);
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(filename).toEqual(expect.stringContaining('-apa'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the APA download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadApaFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download APA' }));

    expect(await screen.findByText(/could not download the APA citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'APA download failed' })).toBeInTheDocument();
  });

  it('downloads a public Harvard citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download Harvard' }));

    expect(await screen.findByText('Harvard downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadHarvardFile).mock.calls[0] ?? [];
    expect(content).toContain(
      'Arena (2026) ‘Shareable research’, Arena Agent report. Available at:',
    );
    expect(content).toContain('(Accessed: 14 August 2026)');
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(filename).toEqual(expect.stringContaining('-harvard'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the Harvard download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadHarvardFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download Harvard' }));

    expect(await screen.findByText(/could not download the Harvard citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Harvard download failed' })).toBeInTheDocument();
  });

  it('downloads a public Chicago citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download Chicago' }));

    expect(await screen.findByText('Chicago downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadChicagoFile).mock.calls[0] ?? [];
    expect(content).toContain(
      'Arena. “Shareable research.” Arena Agent report. August 14, 2026.',
    );
    expect(content).toContain(window.location.href);
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(filename).toEqual(expect.stringContaining('-chicago'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the Chicago download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadChicagoFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download Chicago' }));

    expect(await screen.findByText(/could not download the Chicago citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chicago download failed' })).toBeInTheDocument();
  });

  it('downloads a public MLA citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download MLA' }));

    expect(await screen.findByText('MLA downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadMlaFile).mock.calls[0] ?? [];
    expect(content).toContain(
      'Arena. “Shareable research.” Arena Agent report, 14 Aug. 2026, http://localhost:3000/.',
    );
    expect(content).toContain(window.location.href);
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(filename).toEqual(expect.stringContaining('-mla'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the MLA download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadMlaFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download MLA' }));

    expect(await screen.findByText(/could not download the MLA citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MLA download failed' })).toBeInTheDocument();
  });

  it('starts a fresh feedback window when the MLA citation is downloaded again', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      renderShare();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const downloadMla = () =>
        fireEvent.click(
          screen.getByRole('button', { name: /^(Download MLA|MLA downloaded)$/ }),
        );
      downloadMla();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: 'MLA downloaded' })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1500));
      downloadMla();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => vi.advanceTimersByTime(1500));

      expect(screen.getByRole('button', { name: 'MLA downloaded' })).toBeInTheDocument();
      expect(downloadMlaFile).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloads a public IEEE citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download IEEE' }));

    expect(await screen.findByText('IEEE downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadIeeeFile).mock.calls[0] ?? [];
    expect(content).toContain(
      'Arena, “Shareable research,” Arena Agent report, Aug. 14, 2026. [Online]. Available:',
    );
    expect(content).toContain(window.location.href);
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(filename).toEqual(expect.stringContaining('-ieee'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the IEEE download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadIeeeFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download IEEE' }));

    expect(await screen.findByText(/could not download the IEEE citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'IEEE download failed' })).toBeInTheDocument();
  });

  it('downloads all prose citations without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download all citations' }));

    expect(await screen.findByText('All citations downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadCitationBundleFile).mock.calls[0] ?? [];
    expect(content).toContain('APA\n');
    expect(content).toContain('Chicago\n');
    expect(content).toContain('Harvard\n');
    expect(content).toContain('IEEE\n');
    expect(content).toContain('MLA\n');
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(filename).toEqual(expect.stringContaining('-all'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the citation bundle download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadCitationBundleFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download all citations' }));

    expect(
      await screen.findByText(/could not download the citation bundle/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bundle download failed' })).toBeInTheDocument();
  });

  it('downloads the public BibTeX citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download .bib' }));

    expect(await screen.findByText('BibTeX downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadBibtexFile).mock.calls[0] ?? [];
    expect(content).toMatch(/^@online\{arena_shareable_research_20260814_[a-z0-9]+,/m);
    expect(content).toContain('title = {Shareable research}');
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('keeps tracking parameters and fragments out of the downloaded citation URL', async () => {
    const originalUrl = window.location.href;
    window.history.replaceState(
      {},
      '',
      '/share/agent/tok_1234567890abcdef?utm_source=research&session=private#draft',
    );
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      renderShare();
      await screen.findByText('Is this report shareable?');

      fireEvent.click(screen.getByRole('button', { name: 'Download .bib' }));

      const [content] = vi.mocked(downloadBibtexFile).mock.calls[0] ?? [];
      const canonicalUrl = `${window.location.origin}/share/agent/tok_1234567890abcdef`;
      expect(content).toContain(`url = {${canonicalUrl.replace(/_/g, '\\_')}},`);
      expect(content).not.toContain('utm_source');
      expect(content).not.toContain('session=private');
      expect(content).not.toContain('#draft');
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

  it('shows an honest error when the BibTeX download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadBibtexFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download .bib' }));

    expect(await screen.findByText(/could not download the BibTeX citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BibTeX download failed' })).toBeInTheDocument();
  });

  it('downloads a public RIS citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download .ris' }));

    expect(await screen.findByText('RIS downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadRisFile).mock.calls[0] ?? [];
    expect(content).toContain('TY  - ELEC');
    expect(content).toContain('TI  - Shareable research');
    expect(content).toContain('DA  - 2026/08/14');
    expect(content).toContain('Question: Is this report shareable?');
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the RIS download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadRisFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download .ris' }));

    expect(await screen.findByText(/could not download the RIS citation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RIS download failed' })).toBeInTheDocument();
  });

  it('downloads a public CSL-JSON citation without the report body or share token', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download .csl.json' }));

    expect(await screen.findByText('CSL-JSON downloaded')).toBeInTheDocument();
    const [content, filename] = vi.mocked(downloadCslJsonFile).mock.calls[0] ?? [];
    expect(content).toContain('"type": "webpage"');
    expect(content).toContain('"title": "Shareable research"');
    expect(content).toContain('Question: Is this report shareable?');
    expect(filename).toEqual(expect.stringContaining('agent-share-citation-'));
    expect(content).not.toContain('Yes, with a token and a public page.');
    expect(content).not.toContain('tok_1234567890abcdef');
  });

  it('shows an honest error when the CSL-JSON download fails', async () => {
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    vi.mocked(downloadCslJsonFile).mockReturnValueOnce(false);
    renderShare();
    await screen.findByText('Is this report shareable?');

    fireEvent.click(screen.getByRole('button', { name: 'Download .csl.json' }));

    expect(await screen.findByText(/try Copy CSL-JSON instead/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSL-JSON download failed' })).toBeInTheDocument();
  });

  it('starts a fresh feedback window when the CSL-JSON citation is downloaded again', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
      renderShare();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const downloadCslJson = () =>
        fireEvent.click(
          screen.getByRole('button', {
            name: /^(Download \.csl\.json|CSL-JSON downloaded)$/,
          }),
        );
      downloadCslJson();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: 'CSL-JSON downloaded' })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1500));
      downloadCslJson();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => vi.advanceTimersByTime(1500));

      expect(screen.getByRole('button', { name: 'CSL-JSON downloaded' })).toBeInTheDocument();
      expect(downloadCslJsonFile).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the browser print dialog for a shared report', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    vi.mocked(getPublicAgentReport).mockResolvedValueOnce(report());
    renderShare();
    await screen.findByText('Is this report shareable?');

    expect(document.querySelector('.share-landing--agent')).toBeInTheDocument();
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
