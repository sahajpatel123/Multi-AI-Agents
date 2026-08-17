import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MemoryPage } from './MemoryPage';
import { ApiError, type MemorySummary, type MemorySummariesResponse } from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { downloadJsonFile, downloadMarkdownFile } from '../lib/downloadTextFile';

const baseSummary: MemorySummary = {
  id: 1,
  session_id: 'session-1',
  dominant_category: 'decision',
  preferred_depth: 'deep',
  trusted_persona: 'analyst',
  exchange_count: 8,
  main_topics: ['Indian IPO market', 'Regulatory shifts'],
  compressed_at: '2026-08-16T10:00:00Z',
  created_at: '2026-08-16T09:30:00Z',
};

const olderSummary: MemorySummary = {
  id: 2,
  session_id: 'session-2',
  dominant_category: 'research',
  preferred_depth: 'moderate',
  trusted_persona: 'scientist',
  exchange_count: 4,
  main_topics: ['Quantum computing'],
  compressed_at: '2026-08-10T18:00:00Z',
  created_at: '2026-08-10T17:00:00Z',
};

const detailSummary: MemorySummary = {
  ...baseSummary,
  session_summary: 'Explored whether Indian IPOs stay frothy through the next quarter.',
  key_positions_taken: [
    {
      persona_id: 'analyst',
      topic: 'Indian IPOs',
      stance: 'Cautiously optimistic',
      confidence: 82,
    },
  ],
  raw_exchanges_count: 8,
};

function listResponse(summaries: MemorySummary[], total: number, page: number): MemorySummariesResponse {
  return {
    summaries,
    total,
    page,
    per_page: 20,
    total_pages: 1,
    filters: { category: null, persona_id: null, search: null, from_date: null, to_date: null },
  };
}

const tierState: { canUseFeature: ReturnType<typeof vi.fn> } = {
  canUseFeature: vi.fn().mockImplementation((feature: string) => feature === 'memory'),
};

const navigateMock = vi.fn();
const listMemorySummariesMock = vi.fn();
const getMemorySummaryMock = vi.fn();
const deleteMemorySummaryMock = vi.fn();
const deleteMemorySummariesMock = vi.fn();
const exportMemorySummariesMock = vi.fn();

vi.mock('../context/TierContext', () => ({
  useTier: () => tierState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listMemorySummaries: (...args: unknown[]) => listMemorySummariesMock(...args),
    getMemorySummary: (...args: unknown[]) => getMemorySummaryMock(...args),
    deleteMemorySummary: (...args: unknown[]) => deleteMemorySummaryMock(...args),
    deleteMemorySummaries: (...args: unknown[]) => deleteMemorySummariesMock(...args),
    exportMemorySummaries: (...args: unknown[]) => exportMemorySummariesMock(...args),
  };
});

vi.mock('../lib/downloadTextFile', async () => {
  const actual = await vi.importActual<typeof import('../lib/downloadTextFile')>(
    '../lib/downloadTextFile',
  );
  return {
    ...actual,
    downloadBlobFile: vi.fn().mockReturnValue(true),
    downloadJsonFile: vi.fn().mockReturnValue(true),
    downloadMarkdownFile: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <MemoryPage />
    </MemoryRouter>,
  );
}

describe('MemoryPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    listMemorySummariesMock.mockReset();
    getMemorySummaryMock.mockReset();
    deleteMemorySummaryMock.mockReset();
    deleteMemorySummariesMock.mockReset();
    exportMemorySummariesMock.mockReset();
    vi.mocked(copyToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadJsonFile).mockReset().mockReturnValue(true);
    vi.mocked(downloadMarkdownFile).mockReset().mockReturnValue(true);
    tierState.canUseFeature.mockImplementation((feature: string) => feature === 'memory');
    listMemorySummariesMock.mockImplementation(
      async (params: { page?: number } = {}) =>
        params.page && params.page > 1
          ? listResponse([olderSummary], 2, 2)
          : listResponse([baseSummary], 2, 1),
    );
    getMemorySummaryMock.mockResolvedValue(detailSummary);
    deleteMemorySummaryMock.mockResolvedValue(undefined);
    deleteMemorySummariesMock.mockResolvedValue({
      status: 'deleted',
      requested: 2,
      deleted: 2,
      ids: [1, 2],
    });
    exportMemorySummariesMock.mockResolvedValue({
      blob: new Blob(['export'], { type: 'text/csv' }),
      filename: 'arena-memory-summaries-1.csv',
    });
  });

  it('renders saved summaries with topics, category, persona, and count', async () => {
    renderPage();

    expect(await screen.findByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('Indian IPO market')).toBeInTheDocument();
    expect(screen.getByText('Regulatory shifts')).toBeInTheDocument();
    expect(screen.getByText('The Analyst')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.className === 'memory-card__meta' &&
          /8 exchanges · deep depth/.test(element.textContent || ''),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('2 saved')).toBeInTheDocument();
  });

  it('loads older memories on demand without dropping the first page', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: /Load older memories/i }));

    expect(await screen.findByText('Quantum computing')).toBeInTheDocument();
    expect(screen.getByText('Indian IPO market')).toBeInTheDocument();
    expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
      page: 2,
      perPage: 20,
      search: '',
    });
  });

  it('surfaces a failed older-memories load with a retry and keeps the first page', async () => {
    let pageTwoCalls = 0;
    listMemorySummariesMock.mockImplementation(async (params: { page?: number } = {}) => {
      if (params.page && params.page > 1) {
        pageTwoCalls += 1;
        if (pageTwoCalls === 1) throw new ApiError('boom', 500);
        return listResponse([olderSummary], 2, 2);
      }
      return listResponse([baseSummary], 2, 1);
    });
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: /Load older memories/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByText('Indian IPO market')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Quantum computing')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops offering older pages once an append returns no rows', async () => {
    listMemorySummariesMock.mockImplementation(async (params: { page?: number } = {}) =>
      params.page && params.page > 1
        ? listResponse([], 2, 2)
        : listResponse([baseSummary], 2, 1),
    );
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: /Load older memories/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /Load older memories/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('releases a pending older-page state when a filter refresh starts', async () => {
    let resolvePageTwo: ((value: MemorySummariesResponse) => void) | undefined;
    let resolveFilteredPage: ((value: MemorySummariesResponse) => void) | undefined;
    listMemorySummariesMock.mockImplementation(
      (params: { page?: number; category?: string } = {}) => {
        if (params.page && params.page > 1) {
          return new Promise<MemorySummariesResponse>((resolve) => {
            resolvePageTwo = resolve;
          });
        }
        if (params.category === 'decision') {
          return new Promise<MemorySummariesResponse>((resolve) => {
            resolveFilteredPage = resolve;
          });
        }
        return Promise.resolve(listResponse([baseSummary], 2, 1));
      },
    );
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: /Load older memories/i }));
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 2,
        perPage: 20,
        search: '',
      });
    });
    expect(screen.getByRole('button', { name: /Load older memories/i })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter memory by category' }), {
      target: { value: 'decision' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        category: 'decision',
      });
    });
    expect(screen.getByRole('button', { name: /Load older memories/i })).not.toHaveAttribute(
      'aria-busy',
    );

    resolveFilteredPage?.(listResponse([baseSummary], 2, 1));
    resolvePageTwo?.(listResponse([olderSummary], 2, 2));
    await waitFor(() => expect(screen.queryByText('Quantum computing')).not.toBeInTheDocument());
  });

  it('locks pagination while a new summary order is loading', async () => {
    let resolveSortedPage: ((value: MemorySummariesResponse) => void) | undefined;
    listMemorySummariesMock.mockImplementation(
      (params: { page?: number; sort?: string } = {}) => {
        if (params.sort === 'most_exchanges') {
          return new Promise<MemorySummariesResponse>((resolve) => {
            resolveSortedPage = resolve;
          });
        }
        return params.page && params.page > 1
          ? listResponse([olderSummary], 2, 2)
          : listResponse([baseSummary], 2, 1);
      },
    );
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort memory summaries' }), {
      target: { value: 'most_exchanges' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        sort: 'most_exchanges',
      });
    });

    const loadMoreButton = screen.getByRole('button', { name: 'Load more memories' });
    expect(loadMoreButton).toHaveAttribute('disabled');
    fireEvent.click(loadMoreButton);
    expect(
      listMemorySummariesMock.mock.calls.some(([params]) => params?.page === 2),
    ).toBe(false);

    resolveSortedPage?.(listResponse([baseSummary], 2, 1));
    await waitFor(() => expect(loadMoreButton).not.toHaveAttribute('disabled'));
  });

  it('sends the debounced search query to the list endpoint', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search memory summaries' }), {
      target: { value: 'IPO' },
    });

    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: 'IPO',
      });
    });
  });

  it('filters summaries by kind, trusted mind, and date range, then clears every filter', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter memory by category' }), {
      target: { value: 'decision' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        category: 'decision',
      });
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter memory by trusted mind' }), {
      target: { value: 'analyst' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        category: 'decision',
        personaId: 'analyst',
      });
    });

    fireEvent.change(screen.getByLabelText('Filter memory from date'), {
      target: { value: '2026-08-01' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        category: 'decision',
        personaId: 'analyst',
        fromDate: '2026-08-01',
      });
    });

    fireEvent.change(screen.getByLabelText('Filter memory to date'), {
      target: { value: '2026-08-16' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        category: 'decision',
        personaId: 'analyst',
        fromDate: '2026-08-01',
        toDate: '2026-08-16',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
      });
    });
    expect(screen.getByRole('combobox', { name: 'Filter memory by category' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Filter memory by trusted mind' })).toHaveValue('');
    expect(screen.getByLabelText('Filter memory from date')).toHaveValue('');
    expect(screen.getByLabelText('Filter memory to date')).toHaveValue('');
  });

  it('exports active category, trusted-mind, and date filters', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter memory by category' }), {
      target: { value: 'decision' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter memory by trusted mind' }), {
      target: { value: 'analyst' },
    });
    fireEvent.change(screen.getByLabelText('Filter memory from date'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('Filter memory to date'), {
      target: { value: '2026-08-16' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        category: 'decision',
        personaId: 'analyst',
        fromDate: '2026-08-01',
        toDate: '2026-08-16',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => {
      expect(exportMemorySummariesMock).toHaveBeenCalledWith('csv', {
        search: '',
        category: 'decision',
        personaId: 'analyst',
        fromDate: '2026-08-01',
        toDate: '2026-08-16',
      });
    });
  });

  it('reloads and exports with the selected summary order', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort memory summaries' }), {
      target: { value: 'most_exchanges' },
    });

    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: '',
        sort: 'most_exchanges',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => {
      expect(exportMemorySummariesMock).toHaveBeenCalledWith('csv', {
        search: '',
        sort: 'most_exchanges',
      });
    });
  });

  it('exports the active search as CSV and disables the other format while busy', async () => {
    const { downloadBlobFile } = await import('../lib/downloadTextFile');
    let resolveExport: ((value: { blob: Blob; filename: string }) => void) | undefined;
    exportMemorySummariesMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        }),
    );
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search memory summaries' }), {
      target: { value: 'IPO' },
    });
    await waitFor(() => {
      expect(listMemorySummariesMock).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 20,
        search: 'IPO',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => {
      expect(exportMemorySummariesMock).toHaveBeenCalledWith('csv', { search: 'IPO' });
    });
    expect(screen.getByRole('button', { name: 'JSON' })).toBeDisabled();

    resolveExport?.({
      blob: new Blob(['export'], { type: 'text/csv' }),
      filename: 'arena-memory-summaries-1.csv',
    });
    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-memory-summaries-1.csv',
      );
    });
  });

  it('offers Markdown as a portable memory export', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));

    await waitFor(() => {
      expect(exportMemorySummariesMock).toHaveBeenCalledWith('md', {
        search: '',
      });
    });
  });

  it('reports an export failure without losing the memory list', async () => {
    exportMemorySummariesMock.mockRejectedValueOnce(new ApiError('export boom', 500));
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    expect(await screen.findByText('export boom')).toBeInTheDocument();
    expect(screen.getByText('Indian IPO market')).toBeInTheDocument();
  });

  it('hydrates the full summary body when expanded', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));

    expect(await screen.findByText(/Indian IPOs stay frothy/)).toBeInTheDocument();
    expect(screen.getByText(/Cautiously optimistic/)).toBeInTheDocument();
    expect(getMemorySummaryMock).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Hide summary' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('copies an expanded summary as Markdown with its key positions', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    await screen.findByText(/Indian IPOs stay frothy/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));

    expect(await screen.findByRole('button', { name: 'Summary copied' })).toHaveTextContent('Copied');
    expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('# Arena memory — Decision'));
    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('Explored whether Indian IPOs stay frothy through the next quarter.'),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('- The Analyst — Indian IPOs: Cautiously optimistic'),
    );
  });

  it('downloads an expanded summary as a dated Markdown file', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    await screen.findByText(/Indian IPOs stay frothy/);
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));

    expect(await screen.findByRole('button', { name: 'Summary downloaded' })).toHaveTextContent(
      'Downloaded',
    );
    expect(downloadMarkdownFile).toHaveBeenCalledWith(
      expect.stringContaining('# Arena memory — Decision'),
      'arena-memory-summary-1',
    );
  });

  it('reports when an individual Markdown download cannot start', async () => {
    vi.mocked(downloadMarkdownFile).mockReturnValueOnce(false);
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    await screen.findByText(/Indian IPOs stay frothy/);
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));

    expect(await screen.findByRole('button', { name: 'Download failed' })).toHaveTextContent(
      'Download failed',
    );
  });

  it('recovers when the Markdown downloader throws unexpectedly', async () => {
    vi.mocked(downloadMarkdownFile).mockImplementationOnce(() => {
      throw new Error('browser download blocked');
    });
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    await screen.findByText(/Indian IPOs stay frothy/);
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));

    const downloadButton = await screen.findByRole('button', { name: 'Download failed' });
    expect(downloadButton).toHaveTextContent('Download failed');

    fireEvent.click(downloadButton);
    expect(await screen.findByRole('button', { name: 'Summary downloaded' })).toHaveTextContent(
      'Downloaded',
    );
  });

  it('shows a clear failure state when the clipboard is unavailable', async () => {
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    await screen.findByText(/Indian IPOs stay frothy/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toHaveTextContent('Copy failed');
  });

  it('keeps copied Markdown metadata safe and preserves position confidence', async () => {
    getMemorySummaryMock.mockResolvedValueOnce({
      ...detailSummary,
      dominant_category: 'decision\n# forged heading',
      preferred_depth: 'deep\tdepth',
      trusted_persona: 'analyst\n- forged item',
      main_topics: ['Topic\nwith a break', 'Keep `format`'],
      session_summary: 'Line one\n\nLine two',
      key_positions_taken: [
        {
          persona_id: 'analyst',
          topic: 'Launch\nwindow',
          stance: 'Keep `format`',
          confidence: 84,
        },
      ],
    });
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    await screen.findByText(/Line one/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    await screen.findByRole('button', { name: 'Summary copied' });

    const copied = vi.mocked(copyToClipboard).mock.calls[0]?.[0] as string;
    expect(copied).toContain('# Arena memory — Decision # forged heading');
    expect(copied).toContain('- Topics: Topic with a break, Keep \\`format\\`');
    expect(copied).toContain('- The Analyst — Launch window: Keep \\`format\\` (confidence 84%)');
    expect(copied).toContain('Line one\n\nLine two');
    expect(copied).not.toContain('\n# forged heading');
    expect(copied).not.toContain('\n- forged item');
  });

  it('forgets a summary after confirmation and updates the count', async () => {
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    expect(
      screen.getByText(/Forget this memory\? This removes the summary/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(deleteMemorySummaryMock).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('Indian IPO market')).not.toBeInTheDocument();
    });
    expect(screen.getByText('1 saved')).toBeInTheDocument();
  });

  it('keeps the summary and reports the error when a delete fails', async () => {
    deleteMemorySummaryMock.mockRejectedValueOnce(new ApiError('delete boom', 500));
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('delete boom')).toBeInTheDocument();
    expect(screen.getByText('Indian IPO market')).toBeInTheDocument();
    expect(screen.getByText('2 saved')).toBeInTheDocument();
  });

  it('forgets multiple selected visible summaries after confirmation', async () => {
    listMemorySummariesMock.mockResolvedValueOnce(listResponse([baseSummary, olderSummary], 2, 1));
    renderPage();
    await screen.findByText('Indian IPO market');
    await screen.findByText('Quantum computing');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget selected' }));

    expect(screen.getByText(/Forget 2 selected memories\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forget 2 memories' }));

    await waitFor(() => {
      expect(deleteMemorySummariesMock).toHaveBeenCalledWith([1, 2]);
    });
    expect(screen.queryByText('Indian IPO market')).not.toBeInTheDocument();
    expect(screen.queryByText('Quantum computing')).not.toBeInTheDocument();
    expect(screen.getByText('0 saved')).toBeInTheDocument();
  });

  it('copies and downloads selected summaries as one Markdown document', async () => {
    listMemorySummariesMock.mockResolvedValueOnce(listResponse([baseSummary, olderSummary], 2, 1));
    getMemorySummaryMock.mockImplementation(async (id: number) =>
      id === 1
        ? detailSummary
        : {
            ...olderSummary,
            session_summary: 'Compared practical research paths for quantum computing.',
          },
    );
    renderPage();
    await screen.findByText('Indian IPO market');
    await screen.findByText('Quantum computing');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy selected memories' }));

    expect(await screen.findByRole('button', { name: 'Selected memories copied' })).toHaveTextContent(
      'Copied',
    );
    expect(getMemorySummaryMock).toHaveBeenNthCalledWith(1, 1);
    expect(getMemorySummaryMock).toHaveBeenNthCalledWith(2, 2);
    const copied = vi.mocked(copyToClipboard).mock.calls[0]?.[0] as string;
    expect(copied).toContain('# Arena selected memories');
    expect(copied).toContain('- Memories: 2');
    expect(copied).toContain('## Arena memory — Decision');
    expect(copied).toContain('## Arena memory — Research');
    expect(copied).toContain('Compared practical research paths for quantum computing.');

    fireEvent.click(screen.getByRole('button', { name: 'Download selected memories' }));
    await waitFor(() => {
      expect(downloadMarkdownFile).toHaveBeenCalledWith(
        expect.stringContaining('# Arena selected memories'),
        'arena-memory-selection-2',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download selected memories as JSON' }));
    await waitFor(() => {
      expect(downloadJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('"exported_from": "arena"'),
        'arena-memory-selection-2',
      );
    });
    const json = vi.mocked(downloadJsonFile).mock.calls[0]?.[0] as string;
    const archive = JSON.parse(json) as {
      exported_from: string;
      format_version: number;
      memories: MemorySummary[];
    };
    expect(archive.exported_from).toBe('arena');
    expect(archive.format_version).toBe(1);
    expect(archive.memories).toHaveLength(2);
    expect(archive.memories[0]?.session_summary).toContain('Indian IPOs');
  });

  it('keeps the selection and reports a detail failure during selected export', async () => {
    getMemorySummaryMock.mockRejectedValueOnce(new ApiError('detail boom', 500));
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy selected memories' }));

    expect(await screen.findByText('detail boom')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select memory summary 1' })).toBeChecked();
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('ignores a pending selected export after a filter refresh', async () => {
    let resolveDetail: ((summary: MemorySummary) => void) | undefined;
    getMemorySummaryMock.mockImplementationOnce(
      () =>
        new Promise<MemorySummary>((resolve) => {
          resolveDetail = resolve;
        }),
    );
    listMemorySummariesMock.mockImplementation(async (params: { category?: string } = {}) =>
      params.category === 'decision'
        ? listResponse([olderSummary], 1, 1)
        : listResponse([baseSummary], 2, 1),
    );
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy selected memories' }));
    await waitFor(() => expect(getMemorySummaryMock).toHaveBeenCalledWith(1));

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter memory by category' }), {
      target: { value: 'decision' },
    });
    await screen.findByText('Quantum computing');

    resolveDetail?.(detailSummary);
    await waitFor(() => expect(copyToClipboard).not.toHaveBeenCalled());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 2' }));
    expect(screen.getByRole('button', { name: 'Copy selected memories' })).toBeInTheDocument();
  });

  it('does not download a pending JSON export after the page unmounts', async () => {
    let resolveDetail: ((summary: MemorySummary) => void) | undefined;
    getMemorySummaryMock.mockImplementationOnce(
      () =>
        new Promise<MemorySummary>((resolve) => {
          resolveDetail = resolve;
        }),
    );
    const { unmount } = renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select memory summary 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download selected memories as JSON' }));
    await waitFor(() => expect(getMemorySummaryMock).toHaveBeenCalledWith(1));

    unmount();
    resolveDetail?.(detailSummary);
    await waitFor(() => expect(downloadJsonFile).not.toHaveBeenCalled());
  });

  it('caps select-all at the server bulk-delete limit', async () => {
    const summaries = Array.from({ length: 51 }, (_, index) => ({
      ...baseSummary,
      id: index + 1,
      main_topics: [`Topic ${index + 1}`],
    }));
    listMemorySummariesMock.mockResolvedValueOnce(listResponse(summaries, 51, 1));
    renderPage();
    await screen.findByText('Topic 51');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible memories' }));

    expect(screen.getByText('50 selected · max 50')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select memory summary 50' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select memory summary 51' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select memory summary 51' })).toBeDisabled();
    expect(
      screen.getByText(/You can forget up to 50 memories at a time/),
    ).toBeInTheDocument();
  });

  it('retries a failed detail load when the summary is re-expanded', async () => {
    getMemorySummaryMock.mockRejectedValueOnce(new ApiError('detail boom', 500));
    renderPage();
    await screen.findByText('Indian IPO market');

    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));
    expect(await screen.findByText('detail boom')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Read summary' }));

    expect(await screen.findByText(/Indian IPOs stay frothy/)).toBeInTheDocument();
  });

  it('shows an upgrade gate when memory is not part of the tier', async () => {
    tierState.canUseFeature.mockReturnValue(false);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Memory' })).toBeInTheDocument();
    expect(screen.getByText(/compresses each Arena session/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View plans/ })).toBeInTheDocument();
    expect(listMemorySummariesMock).not.toHaveBeenCalled();
  });

  it('recovers from a failed list load with a retry', async () => {
    listMemorySummariesMock.mockRejectedValueOnce(new ApiError('boom', 500));
    renderPage();

    expect(await screen.findByText("Couldn't load memory")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Indian IPO market')).toBeInTheDocument();
  });

  it('shows an empty state when nothing has been remembered yet', async () => {
    listMemorySummariesMock.mockResolvedValue(listResponse([], 0, 1));
    renderPage();

    expect(await screen.findByText('Nothing remembered yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Arena' })).toBeInTheDocument();
  });
});
