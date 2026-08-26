import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SessionTurn } from '../types';
import { LeaderboardView } from './LeaderboardView';

const downloadCsvFileMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../lib/downloadTextFile', () => ({
  downloadCsvFile: downloadCsvFileMock,
  downloadMarkdownFile: vi.fn(() => true),
}));

const mockPanel = vi.hoisted(() => [
  { id: 'agent_1', name: 'The Analyst', color: '#5ED8FF' },
  { id: 'agent_2', name: 'The Pragmatist', color: '#D7F64A' },
  { id: 'agent_3', name: 'The Contrarian', color: '#FF6652' },
  { id: 'agent_4', name: 'The Empath', color: '#A98CF8' },
]);

vi.mock('../context/PanelContext', () => ({
  usePanel: () => ({
    panel: mockPanel,
  }),
}));

const turns: SessionTurn[] = [
  {
    turn_id: 'turn-1',
    prompt: 'Should we launch now?',
    prompt_category: 'question',
    agent_responses: {
      agent_1: {
        agent_id: 'agent_1',
        agent_number: 1,
        verdict: '',
        one_liner: 'Ship the smallest honest slice.',
        confidence: 82,
        key_assumption: '',
        timestamp: '',
      },
    },
    winner_id: 'agent_1',
    timestamp: '',
  },
  {
    turn_id: 'turn-2',
    prompt: 'How should we price the product?',
    prompt_category: 'question',
    agent_responses: {
      agent_2: {
        agent_id: 'agent_2',
        agent_number: 2,
        verdict: '',
        one_liner: 'Test willingness to pay before scaling.',
        confidence: 79,
        key_assumption: '',
        timestamp: '',
      },
    },
    winner_id: 'agent_2',
    timestamp: '',
  },
];

describe('LeaderboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads the leaderboard and visible prompts as CSV', () => {
    render(<LeaderboardView turns={turns} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download leaderboard as CSV' }));

    expect(downloadCsvFileMock).toHaveBeenCalledTimes(1);
    expect(downloadCsvFileMock.mock.calls[0][0]).toContain('"record_type"');
    expect(downloadCsvFileMock.mock.calls[0][0]).toContain('"Should we launch now?"');
    expect(downloadCsvFileMock.mock.calls[0][1]).toBe('arena-session-leaderboard');
    expect(screen.getByRole('button', { name: 'Leaderboard CSV downloaded' })).toHaveTextContent(
      'Downloaded',
    );
  });

  it('filters session prompts as the user searches', () => {
    render(<LeaderboardView turns={turns} onBack={vi.fn()} />);

    const search = screen.getByRole('searchbox', { name: 'Search session prompts' });
    expect(screen.getByText('Should we launch now?')).toBeInTheDocument();
    expect(screen.getByText('How should we price the product?')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'willingness pragmatist' } });

    expect(screen.queryByText('Should we launch now?')).not.toBeInTheDocument();
    expect(screen.getByText('How should we price the product?')).toBeInTheDocument();
    expect(
      screen.getByText('Showing 1 of 2 prompts matching “willingness pragmatist”'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 of 2 session prompts match “willingness pragmatist”.',
    );
  });

  it('clears the search and restores the full session view', () => {
    render(<LeaderboardView turns={turns} onBack={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search session prompts' });

    fireEvent.change(search, { target: { value: 'launch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear session prompt search' }));

    expect((search as HTMLInputElement).value).toBe('');
    expect(search).toHaveFocus();
    expect(screen.getByText('Should we launch now?')).toBeInTheDocument();
    expect(screen.getByText('How should we price the product?')).toBeInTheDocument();
  });

  it('resets the search when the leaderboard switches sessions', () => {
    const { rerender } = render(
      <LeaderboardView turns={turns} onBack={vi.fn()} sessionId="session-1" />,
    );
    const search = screen.getByRole('searchbox', { name: 'Search session prompts' });

    fireEvent.change(search, { target: { value: 'launch' } });
    rerender(
      <LeaderboardView turns={[turns[1]]} onBack={vi.fn()} sessionId="session-2" />,
    );

    const nextSearch = screen.getByRole('searchbox', { name: 'Search session prompts' });
    expect((nextSearch as HTMLInputElement).value).toBe('');
    expect(screen.getByText('How should we price the product?')).toBeInTheDocument();
  });
});
