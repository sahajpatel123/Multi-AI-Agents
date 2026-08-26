import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ApiError,
  exportScoringAuditCsv,
  exportScoringAuditJson,
  exportScoringAuditMarkdown,
  fetchScoringAudit,
} from '../api';
import type { ScoringAuditResponse } from '../types';
import { downloadBlobFile } from '../lib/downloadTextFile';
import {
  copyCsvToClipboard,
  copyJsonToClipboard,
  copyMarkdownToClipboard,
  copyToClipboard,
} from '../lib/clipboard';
import { ScoringAuditModal } from './ScoringAuditModal';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchScoringAudit: vi.fn(),
    exportScoringAuditCsv: vi.fn(),
    exportScoringAuditJson: vi.fn(),
    exportScoringAuditMarkdown: vi.fn(),
  };
});

vi.mock('./MicroLoader', () => ({
  default: () => <div data-testid="micro-loader" />,
}));

vi.mock('../lib/downloadTextFile', async () => {
  const actual = await vi.importActual<typeof import('../lib/downloadTextFile')>(
    '../lib/downloadTextFile',
  );
  return { ...actual, downloadBlobFile: vi.fn() };
});

vi.mock('../lib/clipboard', () => ({
  copyCsvToClipboard: vi.fn(),
  copyJsonToClipboard: vi.fn(),
  copyMarkdownToClipboard: vi.fn(),
  copyToClipboard: vi.fn(),
}));

const fetchScoringAuditMock = vi.mocked(fetchScoringAudit);
const exportScoringAuditCsvMock = vi.mocked(exportScoringAuditCsv);
const exportScoringAuditJsonMock = vi.mocked(exportScoringAuditJson);
const exportScoringAuditMarkdownMock = vi.mocked(exportScoringAuditMarkdown);
const downloadBlobFileMock = vi.mocked(downloadBlobFile);
const copyCsvToClipboardMock = vi.mocked(copyCsvToClipboard);
const copyJsonToClipboardMock = vi.mocked(copyJsonToClipboard);
const copyMarkdownToClipboardMock = vi.mocked(copyMarkdownToClipboard);
const copyToClipboardMock = vi.mocked(copyToClipboard);
const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
const COPY_FEEDBACK_MS = 1800;

const auditResponse: ScoringAuditResponse = {
  session_id: 'session-1',
  audit_count: 1,
  total_count: 1,
  audits: [
    {
      id: 1,
      prompt_snippet: 'Should we launch?',
      prompt_category: 'question',
      winner_agent_id: 'agent_1',
      winner_persona_id: 'analyst',
      winner_score: 87,
      scores: { agent_1: 87, agent_2: 74 },
      criteria_breakdown: { agent_1: { relevance: 90, insight: 85 } },
      confidence_values: [{ agent_id: 'agent_1', confidence: 82 }],
      persona_ids_used: ['analyst', 'philosopher'],
      scoring_duration_ms: 1240,
      fallback_used: false,
      created_at: '2026-08-06T10:00:00Z',
    },
  ],
};

function renderModal(props: Partial<React.ComponentProps<typeof ScoringAuditModal>> = {}) {
  return render(<ScoringAuditModal sessionId="session-1" onClose={vi.fn()} {...props} />);
}

describe('ScoringAuditModal', () => {
  beforeAll(() => {
    rectSpy.mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 10,
      bottom: 10,
      width: 10,
      height: 10,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterAll(() => {
    rectSpy.mockRestore();
  });

  beforeEach(() => {
    fetchScoringAuditMock.mockReset();
    exportScoringAuditCsvMock.mockReset();
    exportScoringAuditJsonMock.mockReset();
    exportScoringAuditMarkdownMock.mockReset();
    downloadBlobFileMock.mockReset();
    copyCsvToClipboardMock.mockReset();
    copyJsonToClipboardMock.mockReset();
    copyMarkdownToClipboardMock.mockReset();
    copyToClipboardMock.mockReset();
    copyCsvToClipboardMock.mockResolvedValue(true);
    copyJsonToClipboardMock.mockResolvedValue(true);
    copyMarkdownToClipboardMock.mockResolvedValue(true);
    copyToClipboardMock.mockResolvedValue(true);
  });

  it('fetches and renders per-round scores, criteria, and confidence', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    expect(screen.getByLabelText('Per-mind scores')).toBeInTheDocument();
    expect(screen.getAllByText('The Analyst').length).toBeGreaterThan(0);
    expect(screen.getByText('The Philosopher')).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => element?.tagName === 'SPAN' && element.textContent === 'relevance: 90'),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => element?.tagName === 'SPAN' && element.textContent === 'The Analyst 82%'),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === 'Scored in 1240 ms'),
    ).toBeInTheDocument();
    expect(fetchScoringAuditMock).toHaveBeenCalledWith('session-1');
  });

  it('labels rounds where the judge fell back to default scores', async () => {
    fetchScoringAuditMock.mockResolvedValue({
      ...auditResponse,
      audits: [{ ...auditResponse.audits[0], fallback_used: true }],
    });
    renderModal();

    expect(await screen.findByText('Judge fallback')).toBeInTheDocument();
  });

  it('shows an empty state when the session has no audits', async () => {
    fetchScoringAuditMock.mockResolvedValue({
      session_id: 'session-1',
      audit_count: 0,
      total_count: 0,
      audits: [],
    });
    renderModal();

    expect(
      await screen.findByText('No scoring audits found for this session.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export scoring audit as csv/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as json/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as markdown/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as json/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as markdown/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as csv/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as summary/i }),
    ).toBeDisabled();
  });

  it('treats a 404 audit_not_found response as an empty state instead of an error', async () => {
    fetchScoringAuditMock.mockRejectedValue(
      new ApiError('No scoring audit found for this session.', 404, {
        error: 'audit_not_found',
        message: 'No scoring audit found for this session.',
      }),
    );
    renderModal();

    expect(
      await screen.findByText('No scoring audits recorded for this session.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows the error and retries the request', async () => {
    fetchScoringAuditMock
      .mockRejectedValueOnce(new Error('Could not load scoring audit'))
      .mockResolvedValueOnce(auditResponse);
    renderModal();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    expect(fetchScoringAuditMock).toHaveBeenCalledTimes(2);
  });

  it('traps Tab focus inside the dialog', async () => {
    fetchScoringAuditMock.mockRejectedValue(new Error('boom'));
    renderModal();
    await screen.findByRole('alert');

    const closeButton = screen.getByLabelText('Close scoring audit');
    const retryButton = screen.getByRole('button', { name: /retry/i });

    retryButton.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(retryButton);
  });

  it('locks background scroll while open and restores it on close', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores focus to the opener when the dialog closes', () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderModal();
    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes on Escape and via the close button', () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Close scoring audit'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('exports the visible rounds as CSV', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const blob = new Blob(['round,prompt_snippet\n1,Should we launch?'], {
      type: 'text/csv',
    });
    exportScoringAuditCsvMock.mockResolvedValue(blob);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export scoring audit as csv/i }));

    await waitFor(() => {
      expect(exportScoringAuditCsvMock).toHaveBeenCalledWith('session-1', 1);
    });
    expect(downloadBlobFileMock).toHaveBeenCalledWith(
      blob,
      'arena-scoring-audit-session-1.csv',
    );
  });

  it('shows an error when the CSV export fails', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    exportScoringAuditCsvMock.mockRejectedValue(new Error('Export failed'));
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export scoring audit as csv/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed');
    expect(downloadBlobFileMock).not.toHaveBeenCalled();
  });

  it('exports the visible rounds as JSON', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const blob = new Blob(['{"session_id":"session-1"}\n'], {
      type: 'application/json',
    });
    exportScoringAuditJsonMock.mockResolvedValue(blob);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export scoring audit as json/i }));

    await waitFor(() => {
      expect(exportScoringAuditJsonMock).toHaveBeenCalledWith('session-1', 1);
    });
    expect(downloadBlobFileMock).toHaveBeenCalledWith(
      blob,
      'arena-scoring-audit-session-1.json',
    );
  });

  it('exports the visible rounds as Markdown', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const blob = new Blob(['# Arena — scoring audit\n'], {
      type: 'text/markdown',
    });
    exportScoringAuditMarkdownMock.mockResolvedValue(blob);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export scoring audit as markdown/i }));

    await waitFor(() => {
      expect(exportScoringAuditMarkdownMock).toHaveBeenCalledWith('session-1', 1);
    });
    expect(downloadBlobFileMock).toHaveBeenCalledWith(
      blob,
      'arena-scoring-audit-session-1.md',
    );
  });

  it('copies the visible rounds as Markdown without downloading a file', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const markdown = '# Arena — scoring audit\n\n| Winner | Score |\n| --- | --- |\n';
    exportScoringAuditMarkdownMock.mockResolvedValue(
      { text: async () => markdown } as unknown as Blob,
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as markdown/i }),
    );

    await waitFor(() => {
      expect(exportScoringAuditMarkdownMock).toHaveBeenCalledWith('session-1', 1);
      expect(copyMarkdownToClipboardMock).toHaveBeenCalledWith(markdown);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Markdown copied to the clipboard.',
    );
    expect(downloadBlobFileMock).not.toHaveBeenCalled();
  });

  it('surfaces a clipboard failure instead of claiming Markdown was copied', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    copyMarkdownToClipboardMock.mockResolvedValue(false);
    exportScoringAuditMarkdownMock.mockResolvedValue(
      { text: async () => '# Arena — scoring audit\n' } as unknown as Blob,
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as markdown/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not copy/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('copies the visible rounds as spreadsheet-aware CSV without downloading a file', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const csv = 'round,prompt_snippet\r\n1,Should we launch?\r\n';
    exportScoringAuditCsvMock.mockResolvedValue(
      { text: async () => csv } as unknown as Blob,
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as csv/i }),
    );

    await waitFor(() => {
      expect(exportScoringAuditCsvMock).toHaveBeenCalledWith('session-1', 1);
      expect(copyCsvToClipboardMock).toHaveBeenCalledWith(csv);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'CSV copied to the clipboard.',
    );
    expect(downloadBlobFileMock).not.toHaveBeenCalled();
  });

  it('copies the visible rounds as JSON without downloading a file', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const json = '{"session_id":"session-1","audits":[]}';
    exportScoringAuditJsonMock.mockResolvedValue(
      { text: async () => json } as unknown as Blob,
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as json/i }),
    );

    await waitFor(() => {
      expect(exportScoringAuditJsonMock).toHaveBeenCalledWith('session-1', 1);
      expect(copyJsonToClipboardMock).toHaveBeenCalledWith(json);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'JSON copied to the clipboard.',
    );
    expect(downloadBlobFileMock).not.toHaveBeenCalled();
  });

  it('copies a compact summary with the winner and runner-up for each round', async () => {
    fetchScoringAuditMock.mockResolvedValue({
      ...auditResponse,
      audits: [
        auditResponse.audits[0],
        {
          ...auditResponse.audits[0],
          id: 2,
          prompt_snippet: 'Which path is safer?',
          winner_agent_id: 'agent_2',
          winner_persona_id: 'philosopher',
          winner_score: 91,
          scores: { agent_1: 78, agent_2: 91 },
          fallback_used: true,
        },
      ],
      audit_count: 2,
      total_count: 2,
    });
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as summary/i }),
    );

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledWith(
        [
          'Arena scoring audit',
          'session-1 · 2 rounds',
          '',
          'Should we launch? → The Analyst (87/100) vs The Philosopher 74',
          'Which path is safer? → The Philosopher (91/100) vs The Analyst 78 (judge fallback)',
        ].join('\n'),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Summary copied to the clipboard.',
    );
    expect(exportScoringAuditCsvMock).not.toHaveBeenCalled();
    expect(exportScoringAuditJsonMock).not.toHaveBeenCalled();
    expect(exportScoringAuditMarkdownMock).not.toHaveBeenCalled();
    expect(downloadBlobFileMock).not.toHaveBeenCalled();
  });

  it('digests empty rounds as unknown without inventing data', async () => {
    fetchScoringAuditMock.mockResolvedValue({
      ...auditResponse,
      audit_count: 2,
      total_count: 2,
      audits: [
        { ...auditResponse.audits[0], id: 7, fallback_used: true },
        {
          id: 8,
          prompt_snippet: '',
          prompt_category: null,
          winner_agent_id: null,
          winner_persona_id: null,
          winner_score: null,
          scores: {},
          criteria_breakdown: null,
          confidence_values: null,
          persona_ids_used: [],
          scoring_duration_ms: null,
          fallback_used: false,
          created_at: null,
        },
      ],
    });
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as summary/i }),
    );

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
    });
    const digest = copyToClipboardMock.mock.calls[0]?.[0] ?? '';
    expect(digest).toContain(
      'Should we launch? → The Analyst (87/100) vs The Philosopher 74 (judge fallback)',
    );
    expect(digest).toContain('(no prompt captured) → Unknown');
    expect(digest).toContain('session-1 · 2 rounds');
  });

  it('collapses and caps prompts so each round stays on one summary line', async () => {
    const rawPrompt =
      'Should   we\nlaunch\nnow,\t\tor wait for the quarterly numbers and the revised forecast before deciding anything at all about the public roadmap?';
    const collapsed = rawPrompt.replace(/\s+/g, ' ').trim();
    expect(collapsed.length).toBeGreaterThan(120);
    fetchScoringAuditMock.mockResolvedValue({
      ...auditResponse,
      audit_count: 1,
      total_count: 1,
      audits: [{ ...auditResponse.audits[0], id: 9, prompt_snippet: rawPrompt }],
    });
    renderModal();

    expect(await screen.findByText(/Should/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as summary/i }),
    );

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
    });
    const digest = copyToClipboardMock.mock.calls[0]?.[0] ?? '';
    const roundLines = digest.split('\n').slice(3);
    expect(roundLines).toEqual([
      `${collapsed.slice(0, 120)}… → The Analyst (87/100) vs The Philosopher 74`,
    ]);
  });

  it('digests whitespace-only prompts as no prompt captured', async () => {
    fetchScoringAuditMock.mockResolvedValue({
      ...auditResponse,
      audits: [{ ...auditResponse.audits[0], prompt_snippet: '  \n\t ' }],
    });
    renderModal();

    const summaryButton = await screen.findByRole('button', {
      name: /copy scoring audit as summary/i,
    });
    await waitFor(() => {
      expect(summaryButton).toBeEnabled();
    });
    fireEvent.click(summaryButton);

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
    });
    expect(copyToClipboardMock.mock.calls[0]?.[0] ?? '').toContain(
      '(no prompt captured) → The Analyst',
    );
  });

  it('marks summaries that omit older rounds from a truncated session', async () => {
    fetchScoringAuditMock.mockResolvedValue({
      ...auditResponse,
      audit_count: 1,
      total_count: 3,
    });
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as summary/i }),
    );

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledWith(
        [
          'Arena scoring audit',
          'session-1 · showing 1 of 3 rounds',
          '',
          'Should we launch? → The Analyst (87/100) vs The Philosopher 74',
        ].join('\n'),
      );
    });
  });

  it('surfaces a summary clipboard failure instead of claiming it was copied', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    copyToClipboardMock.mockResolvedValue(false);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as summary/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the scoring audit summary',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('surfaces a JSON clipboard failure instead of claiming it was copied', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    copyJsonToClipboardMock.mockResolvedValue(false);
    exportScoringAuditJsonMock.mockResolvedValue(
      { text: async () => '{"audits":[]}' } as unknown as Blob,
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as json/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the scoring audit JSON',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not copy JSON after the modal closes while the export body is read', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    let finishText: ((text: string) => void) | undefined;
    const pendingText = new Promise<string>((resolve) => {
      finishText = resolve;
    });
    exportScoringAuditJsonMock.mockResolvedValue({ text: () => pendingText } as unknown as Blob);
    const { unmount } = renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as json/i }),
    );
    await waitFor(() => {
      expect(exportScoringAuditJsonMock).toHaveBeenCalledWith('session-1', 1);
    });

    unmount();
    await act(async () => {
      finishText?.('{"session_id":"session-1","audits":[]}');
    });

    expect(copyJsonToClipboardMock).not.toHaveBeenCalled();
  });

  it('resets successful CSV copy feedback so the action label stays discoverable', async () => {
    vi.useFakeTimers();
    try {
      fetchScoringAuditMock.mockResolvedValue(auditResponse);
      exportScoringAuditCsvMock.mockResolvedValue(
        { text: async () => 'round,prompt_snippet\r\n1,Should we launch?\r\n' } as unknown as Blob,
      );
      renderModal();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText('Should we launch?')).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: /copy scoring audit as csv/i }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'CSV copied to the clipboard.',
      );
      expect(screen.getByRole('button', { name: 'CSV copied' })).toBeEnabled();

      act(() => vi.advanceTimersByTime(COPY_FEEDBACK_MS));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /copy scoring audit as csv/i }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a CSV clipboard failure instead of claiming it was copied', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    copyCsvToClipboardMock.mockResolvedValue(false);
    exportScoringAuditCsvMock.mockResolvedValue(
      { text: async () => 'round,prompt_snippet\r\n' } as unknown as Blob,
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /copy scoring audit as csv/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the scoring audit CSV',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('disables every export while CSV copy is pending and announces progress', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const csv = 'round,prompt_snippet\r\n1,Should we launch?\r\n';
    exportScoringAuditCsvMock.mockResolvedValue(
      { text: async () => csv } as unknown as Blob,
    );
    let finishCopy: ((ok: boolean) => void) | undefined;
    const pendingCopy = new Promise<boolean>((resolve) => {
      finishCopy = resolve;
    });
    copyCsvToClipboardMock.mockReturnValue(pendingCopy);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    const copyButton = screen.getByRole('button', {
      name: /copy scoring audit as csv/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => expect(copyCsvToClipboardMock).toHaveBeenCalledWith(csv));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copying CSV to the clipboard.',
    );
    expect(copyButton).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as csv/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as json/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as markdown/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as markdown/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as json/i }),
    ).toBeDisabled();

    finishCopy?.(true);
    await waitFor(() => {
      expect(copyButton).toBeEnabled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'CSV copied to the clipboard.',
      );
    });
  });

  it('disables every export while Markdown copy is pending and announces progress', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const markdown = '# Arena — scoring audit\n';
    exportScoringAuditMarkdownMock.mockResolvedValue(
      { text: async () => markdown } as unknown as Blob,
    );
    let finishCopy: ((ok: boolean) => void) | undefined;
    const pendingCopy = new Promise<boolean>((resolve) => {
      finishCopy = resolve;
    });
    copyMarkdownToClipboardMock.mockReturnValue(pendingCopy);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    const copyButton = screen.getByRole('button', {
      name: /copy scoring audit as markdown/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => expect(copyMarkdownToClipboardMock).toHaveBeenCalledWith(markdown));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copying Markdown to the clipboard.',
    );
    expect(copyButton).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as csv/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as json/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /export scoring audit as markdown/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy scoring audit as json/i }),
    ).toBeDisabled();

    finishCopy?.(true);
    await waitFor(() => {
      expect(copyButton).toBeEnabled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Markdown copied to the clipboard.',
      );
    });
  });

  it('surfaces a browser-blocked download instead of claiming success', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    exportScoringAuditCsvMock.mockResolvedValue(
      new Blob(['round,prompt_snippet\n1,Should we launch?'], { type: 'text/csv' }),
    );
    downloadBlobFileMock.mockReturnValue(false);
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export scoring audit as csv/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i);
    expect(downloadBlobFileMock).toHaveBeenCalledTimes(1);
  });

  it('disables the export button while an export is in flight', async () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    let resolveExport: (blob: Blob) => void = () => {};
    exportScoringAuditCsvMock.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveExport = resolve;
        }),
    );
    renderModal();

    expect(await screen.findByText('Should we launch?')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /export scoring audit as csv/i });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Exporting…');

    resolveExport(new Blob(['round,prompt_snippet\n1,Should we launch?'], { type: 'text/csv' }));
    await waitFor(() => expect(button).toBeEnabled());
  });
});
