import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VerdictScoreboard } from './VerdictScoreboard';
import type { VerdictScoreboardEntry } from './VerdictScoreboard';

const entry = (
  agentId: string,
  name: string,
  score: number,
  isWinner = false,
): VerdictScoreboardEntry => ({ agentId, name, score, isWinner });

describe('VerdictScoreboard', () => {
  it('renders nothing with no entries', () => {
    const { container } = render(<VerdictScoreboard entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing with fewer than two scored takes', () => {
    const { container } = render(
      <VerdictScoreboard entries={[entry('agent_1', 'Analyst', 82)]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when every score is identical (fallback artifact)', () => {
    const { container } = render(
      <VerdictScoreboard
        entries={[
          entry('agent_1', 'Analyst', 50, true),
          entry('agent_2', 'Skeptic', 50),
          entry('agent_3', 'Strategist', 50),
          entry('agent_4', 'Pragmatist', 50),
        ]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a collapsed toggle labelled as the judge scorecard', () => {
    render(
      <VerdictScoreboard
        entries={[entry('agent_1', 'Analyst', 88, true), entry('agent_2', 'Skeptic', 71)]}
      />,
    );
    const toggle = screen.getByRole('button', { name: "Judge's scorecard" });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Analyst')).not.toBeVisible();
  });

  it('expands to reveal takes ranked by score and collapses again', () => {
    render(
      <VerdictScoreboard
        entries={[
          entry('agent_1', 'Analyst', 64),
          entry('agent_2', 'Skeptic', 91, true),
          entry('agent_3', 'Strategist', 77),
        ]}
      />,
    );
    const toggle = screen.getByRole('button', { name: "Judge's scorecard" });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows.map((text) => text?.match(/(Analyst|Skeptic|Strategist)/)?.[1])).toEqual([
      'Skeptic',
      'Strategist',
      'Analyst',
    ]);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Skeptic')).not.toBeVisible();
  });

  it('marks the flagged winner even when it is not the top score', () => {
    render(
      <VerdictScoreboard
        entries={[
          entry('agent_1', 'Analyst', 94),
          entry('agent_2', 'Skeptic', 83, true),
          entry('agent_3', 'Strategist', 71),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    const winnerLabel = screen.getByText(', winner');
    const winnerRow = winnerLabel.closest('li');
    expect(winnerRow).not.toBeNull();
    expect(winnerRow).toHaveTextContent('Skeptic');
    expect(winnerRow).toHaveClass('verdict-scoreboard-row--winner');
    expect(winnerRow?.querySelector('.verdict-scoreboard-crown')).not.toBeNull();
  });

  it('falls back to the top-scoring take as winner when nothing is flagged', () => {
    render(
      <VerdictScoreboard
        entries={[
          entry('agent_1', 'Analyst', 94),
          entry('agent_2', 'Skeptic', 83),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    const winnerRow = screen.getByText(', winner').closest('li');
    expect(winnerRow).toHaveTextContent('Analyst');
  });

  it('falls back to the payload winner id before the top score', () => {
    render(
      <VerdictScoreboard
        winnerAgentId="agent_2"
        entries={[
          entry('agent_1', 'Analyst', 94),
          entry('agent_2', 'Skeptic', 83),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    const winnerRow = screen.getByText(', winner').closest('li');
    expect(winnerRow).toHaveTextContent('Skeptic');
    expect(winnerRow).toHaveClass('verdict-scoreboard-row--winner');
    expect(winnerRow?.querySelector('.verdict-scoreboard-crown')).not.toBeNull();
  });

  it('keeps an explicit winner flag ahead of the payload winner id', () => {
    render(
      <VerdictScoreboard
        winnerAgentId="agent_1"
        entries={[
          entry('agent_1', 'Analyst', 94),
          entry('agent_2', 'Skeptic', 83, true),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    const winnerRow = screen.getByText(', winner').closest('li');
    expect(winnerRow).toHaveTextContent('Skeptic');
  });

  it('coerces string scores and clamps out-of-range values for label and bar', () => {
    render(
      <VerdictScoreboard
        entries={[
          entry('agent_1', 'Analyst', '88' as unknown as number),
          entry('agent_2', 'Skeptic', 140),
          entry('agent_3', 'Strategist', -3),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    const fills = document.querySelectorAll('.verdict-scoreboard-fill');
    expect(fills).toHaveLength(3);
    expect(fills[0]).toHaveStyle({ width: '100%' });
    expect(fills[1]).toHaveStyle({ width: '88%' });
    expect(fills[2]).toHaveStyle({ width: '0%' });
    expect(screen.getByText('100')).toHaveTextContent('100 out of 100');
    expect(screen.getByText('88')).toHaveTextContent('88 out of 100');
    expect(screen.getByText('0')).toHaveTextContent('0 out of 100');
  });

  it('drops takes whose score cannot be normalized instead of misranking them', () => {
    render(
      <VerdictScoreboard
        entries={[
          entry('agent_1', 'Analyst', Number.NaN),
          entry('agent_2', 'Skeptic', 71),
          entry('agent_3', 'Strategist', 64),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    expect(screen.queryByText('Analyst')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('announces each take rank and score unit for screen readers', () => {
    render(
      <VerdictScoreboard
        entries={[entry('agent_1', 'Analyst', 80, true), entry('agent_2', 'Skeptic', 40)]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Judge's scorecard" }));

    expect(screen.getByText('1st place')).toBeInTheDocument();
    expect(screen.getByText('2nd place')).toBeInTheDocument();
    expect(screen.getByText('40')).toHaveTextContent('40 out of 100');
  });

  it('sizes each score bar from the score and keeps aria-controls wired', () => {
    render(
      <VerdictScoreboard
        entries={[entry('agent_1', 'Analyst', 80, true), entry('agent_2', 'Skeptic', 40)]}
      />,
    );
    const toggle = screen.getByRole('button', { name: "Judge's scorecard" });
    const body = document.getElementById(toggle.getAttribute('aria-controls') || '');

    expect(body).not.toBeNull();
    expect(body).not.toBeVisible();

    fireEvent.click(toggle);
    const fills = body?.querySelectorAll('.verdict-scoreboard-fill');
    expect(fills).toHaveLength(2);
    expect(fills?.[0]).toHaveStyle({ width: '80%' });
    expect(fills?.[1]).toHaveStyle({ width: '40%' });
    expect(screen.getByText('80')).toHaveTextContent('80 out of 100');
  });
});
