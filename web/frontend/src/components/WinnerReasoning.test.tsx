import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WinnerReasoning } from './WinnerReasoning';

describe('WinnerReasoning', () => {
  it('renders nothing when there is no reasoning', () => {
    const { container } = render(<WinnerReasoning reasoning={null} winnerName="Analyst" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for whitespace-only reasoning', () => {
    const { container } = render(<WinnerReasoning reasoning="   " winnerName="Analyst" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a collapsed toggle labelled with the winner name', () => {
    render(<WinnerReasoning reasoning="Direct and honest." winnerName="Analyst" />);
    const toggle = screen.getByRole('button', { name: 'Why Analyst won' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Direct and honest.')).not.toBeInTheDocument();
  });

  it('expands to reveal the rationale and collapses again', () => {
    render(<WinnerReasoning reasoning="Direct and honest." winnerName="Analyst" />);
    const toggle = screen.getByRole('button', { name: 'Why Analyst won' });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Direct and honest.')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Direct and honest.')).not.toBeInTheDocument();
  });

  it('falls back to a generic label when the winner name is blank', () => {
    render(<WinnerReasoning reasoning="Clear reasoning." winnerName=" " />);
    expect(screen.getByRole('button', { name: 'Why Winner won' })).toBeInTheDocument();
  });
});
