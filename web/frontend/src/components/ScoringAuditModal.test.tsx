import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { fetchScoringAudit } from '../api';
import type { ScoringAuditResponse } from '../types';
import { ScoringAuditModal } from './ScoringAuditModal';

vi.mock('../api', () => ({
  fetchScoringAudit: vi.fn(),
}));

vi.mock('./MicroLoader', () => ({
  default: () => <div data-testid="micro-loader" />,
}));

const fetchScoringAuditMock = vi.mocked(fetchScoringAudit);

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
  beforeEach(() => {
    fetchScoringAuditMock.mockReset();
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

  it('closes on Escape and via the close button', () => {
    fetchScoringAuditMock.mockResolvedValue(auditResponse);
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Close scoring audit'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
