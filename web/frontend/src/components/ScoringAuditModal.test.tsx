import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ApiError,
  exportScoringAuditCsv,
  exportScoringAuditJson,
  exportScoringAuditMarkdown,
  fetchScoringAudit,
} from '../api';
import type { ScoringAuditResponse } from '../types';
import { downloadBlobFile } from '../lib/downloadTextFile';
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

const fetchScoringAuditMock = vi.mocked(fetchScoringAudit);
const exportScoringAuditCsvMock = vi.mocked(exportScoringAuditCsv);
const exportScoringAuditJsonMock = vi.mocked(exportScoringAuditJson);
const exportScoringAuditMarkdownMock = vi.mocked(exportScoringAuditMarkdown);
const downloadBlobFileMock = vi.mocked(downloadBlobFile);
const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');

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
