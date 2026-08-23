import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PromptPipelineStatus } from './PromptPipelineStatus';
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
});
