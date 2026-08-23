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
    expect(screen.getByText('Direct and honest.')).not.toBeVisible();
  });

  it('expands to reveal the rationale and collapses again', () => {
    render(<WinnerReasoning reasoning="Direct and honest." winnerName="Analyst" />);
    const toggle = screen.getByRole('button', { name: 'Why Analyst won' });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Direct and honest.')).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Direct and honest.')).not.toBeVisible();
  });

  it('keeps aria-controls wired to a live element while collapsed', () => {
    render(<WinnerReasoning reasoning="Clear reasoning." winnerName="Analyst" />);
    const toggle = screen.getByRole('button');
    const body = document.getElementById(toggle.getAttribute('aria-controls') || '');

    expect(body).not.toBeNull();
    expect(body).toHaveTextContent('Clear reasoning.');
    expect(body).not.toBeVisible();
  });

  it('uses a unique body id per disclosure instance', () => {
    render(
      <>
        <WinnerReasoning reasoning="First rationale." winnerName="Analyst" />
        <WinnerReasoning reasoning="Second rationale." winnerName="Skeptic" />
      </>,
    );
    const toggles = screen.getAllByRole('button');
    const ids = toggles.map((toggle) => toggle.getAttribute('aria-controls'));

    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toEqual(ids[1]);
  });

  it('falls back to a generic label when the winner name is blank', () => {
    render(<WinnerReasoning reasoning="Clear reasoning." winnerName=" " />);
    expect(screen.getByRole('button', { name: 'Why Winner won' })).toBeInTheDocument();
  });
});
