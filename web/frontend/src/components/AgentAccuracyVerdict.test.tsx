import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentAccuracyVerdict } from './AgentAccuracyVerdict';
import { submitTaskFeedback } from '../api';

vi.mock('../api', () => ({
  submitTaskFeedback: vi.fn(),
}));

const SAVED_OK = { status: 'saved', task_id: 't-1', feedback: 'accurate' };

describe('AgentAccuracyVerdict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(submitTaskFeedback).mockResolvedValue(SAVED_OK);
  });

  it('POSTs the verdict immediately and marks the pill pressed', async () => {
    render(<AgentAccuracyVerdict taskId="t-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Inaccurate' }));

    expect(await screen.findByRole('button', { name: 'Inaccurate' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(submitTaskFeedback).toHaveBeenCalledWith('t-1', 'inaccurate', undefined);
  });

  it('sends a typed note along with the verdict', async () => {
    render(<AgentAccuracyVerdict taskId="t-1" />);

    // The note field only appears once a verdict is chosen.
    fireEvent.click(screen.getByRole('button', { name: 'Accurate' }));
    fireEvent.change(await screen.findByLabelText('Accuracy note (optional)'), {
      target: { value: '  Sources were outdated  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save accuracy note' }));

    await screen.findByText('Note saved');
    expect(submitTaskFeedback).toHaveBeenLastCalledWith('t-1', 'accurate', 'Sources were outdated');
  });

  it('rolls the pill back and shows the refusal verbatim when the POST fails', async () => {
    vi.mocked(submitTaskFeedback).mockRejectedValueOnce(
      new Error('Too many feedback submissions. Limit is 120 per hour. (Request ID: req-1)'),
    );

    render(<AgentAccuracyVerdict taskId="t-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Partially accurate' }));

    const pill = await screen.findByRole('button', { name: 'Partially accurate' });
    await screen.findByRole('alert');
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Too many feedback submissions. Limit is 120 per hour. (Request ID: req-1)',
    );
  });

  it('resends the stored note when the verdict changes — a noteless POST would erase it server-side', async () => {
    render(<AgentAccuracyVerdict taskId="t-1" />);

    // Verdict first (no note yet), then write a note and save it.
    fireEvent.click(screen.getByRole('button', { name: 'Inaccurate' }));
    await screen.findByLabelText('Accuracy note (optional)');
    fireEvent.change(screen.getByLabelText('Accuracy note (optional)'), {
      target: { value: 'Missed the second cause' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save accuracy note' }));
    await screen.findByText('Note saved');

    // Changing the verdict must carry the note with it.
    fireEvent.click(screen.getByRole('button', { name: 'Partially accurate' }));

    expect(submitTaskFeedback).toHaveBeenLastCalledWith(
      't-1',
      'partial',
      'Missed the second cause',
    );
  });

  it('hides the saved marker as soon as the text diverges from what was saved', async () => {
    render(<AgentAccuracyVerdict taskId="t-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Accurate' }));
    fireEvent.change(await screen.findByLabelText('Accuracy note (optional)'), {
      target: { value: 'Solid answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save accuracy note' }));
    expect(await screen.findByText('Note saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Accuracy note (optional)'), {
      target: { value: 'Solid answer, mostly' },
    });

    expect(screen.queryByText('Note saved')).not.toBeInTheDocument();
  });
});
