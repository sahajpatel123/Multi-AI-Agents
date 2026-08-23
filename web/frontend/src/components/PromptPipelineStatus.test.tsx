import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { formatCheckAge, PromptPipelineStatus } from './PromptPipelineStatus';
import { getPromptReadiness } from '../api';
import type { PromptReadiness } from '../api';

vi.mock('../api', () => ({
  getPromptReadiness: vi.fn(),
}));

const OK_READINESS: PromptReadiness = {
  ok: true,
  checkedAt: '2026-08-23T10:00:00Z',
  checks: [
    { name: 'db', state: 'ok' },
    { name: 'memory', state: 'ok' },
    { name: 'prompt_route', state: 'ok' },
  ],
};

describe('PromptPipelineStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('announces a healthy pipeline and offers Refresh', async () => {
    vi.mocked(getPromptReadiness).mockResolvedValueOnce(OK_READINESS);

    render(<PromptPipelineStatus />);

    expect(await screen.findByText('Prompt pipeline ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh prompt pipeline status' })).toBeInTheDocument();
    expect(getPromptReadiness).toHaveBeenCalledWith();
  });

  it('lists the failing checks when the pipeline is degraded', async () => {
    vi.mocked(getPromptReadiness).mockResolvedValueOnce({
      ok: false,
      checkedAt: '2026-08-23T10:01:00Z',
      checks: [
        { name: 'db', state: 'fail: OperationalError' },
        { name: 'memory', state: 'ok' },
        { name: 'prompt_route', state: 'fail: unwired' },
      ],
    });

    render(<PromptPipelineStatus />);

    expect(await screen.findByText('Prompt pipeline degraded')).toBeInTheDocument();
    expect(screen.getByText('(db: fail: OperationalError · prompt_route: fail: unwired)')).toBeInTheDocument();
  });

  it('shows the failure verbatim and recovers via Retry', async () => {
    vi.mocked(getPromptReadiness).mockRejectedValueOnce(new Error('Prompt pipeline status unavailable'));

    render(<PromptPipelineStatus />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Prompt pipeline status unavailable');

    vi.mocked(getPromptReadiness).mockResolvedValueOnce(OK_READINESS);
    fireEvent.click(screen.getByRole('button', { name: 'Retry prompt pipeline status' }));

    expect(await screen.findByText('Prompt pipeline ready')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('dates its own reading so a stale dot cannot pose as fresh', async () => {
    // Timestamp generated inside the test, so the rendered age is
    // deterministically "just now" without fake-timer gymnastics.
    vi.mocked(getPromptReadiness).mockResolvedValueOnce({
      ...OK_READINESS,
      checkedAt: new Date().toISOString(),
    });

    render(<PromptPipelineStatus />);

    expect(await screen.findByText('· checked just now')).toBeInTheDocument();
  });

  it('renders no age claim when the server sent no timestamp', async () => {
    vi.mocked(getPromptReadiness).mockResolvedValueOnce({ ...OK_READINESS, checkedAt: '' });

    render(<PromptPipelineStatus />);

    expect(await screen.findByText('Prompt pipeline ready')).toBeInTheDocument();
    expect(screen.queryByText(/^· checked/)).not.toBeInTheDocument();
  });
});

describe('formatCheckAge', () => {
  const NOW = Date.UTC(2026, 7, 23, 10, 0, 0); // 2026-08-23T10:00:00Z

  it('reads sub-ten-second gaps as "just now"', () => {
    expect(formatCheckAge('2026-08-23T09:59:55Z', NOW)).toBe('just now');
    expect(formatCheckAge('2026-08-23T10:00:09Z', NOW)).toBe('just now');
  });

  it('clamps future timestamps (clock skew) to "just now"', () => {
    expect(formatCheckAge('2026-08-23T10:05:00Z', NOW)).toBe('just now');
  });

  it('counts seconds, minutes, hours and days in human units', () => {
    expect(formatCheckAge('2026-08-23T09:59:01Z', NOW)).toBe('59s ago');
    expect(formatCheckAge('2026-08-23T09:58:00Z', NOW)).toBe('2m ago');
    expect(formatCheckAge('2026-08-23T08:00:00Z', NOW)).toBe('2h ago');
    expect(formatCheckAge('2026-08-21T10:00:00Z', NOW)).toBe('2d ago');
  });

  it('returns null for missing or unparseable timestamps instead of inventing an age', () => {
    expect(formatCheckAge('', NOW)).toBeNull();
    expect(formatCheckAge('not-a-date', NOW)).toBeNull();
  });
});
