import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MoodMatcher } from './MoodMatcher';
import { MOODS, isMoodId } from '../lib/moodMatcher';

describe('moodMatcher (pure helpers)', () => {
  it('exposes five moods', () => {
    expect(MOODS.length).toBe(5);
  });

  it('each mood has a unique id', () => {
    const ids = new Set(MOODS.map((m) => m.id));
    expect(ids.size).toBe(MOODS.length);
  });

  it('isMoodId narrows correctly', () => {
    expect(isMoodId('stuck')).toBe(true);
    expect(isMoodId('zzz')).toBe(false);
    expect(isMoodId(42)).toBe(false);
  });
});

describe('MoodMatcher', () => {
  it('renders the default heading and 5 chips', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    expect(screen.getByText(/What's your mood\?/i)).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(5);
  });

  it('does not show a pick before a chip is clicked', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Try it/)).toBeNull();
  });

  it('reveals a recommended tool when a chip is clicked', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /I'm stuck/i }));
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.some((l) => l.getAttribute('href') === '/persona-battle')).toBe(true);
  });

  it('marks the clicked chip aria-checked=true', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    const stuck = screen.getByRole('radio', { name: /I'm stuck/i });
    fireEvent.click(stuck);
    expect(stuck.getAttribute('aria-checked')).toBe('true');
  });

  it('toggles the pick off when the same chip is clicked twice', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    const stuck = screen.getByRole('radio', { name: /I'm stuck/i });
    fireEvent.click(stuck);
    fireEvent.click(stuck);
    expect(screen.queryByText(/Persona Battle/i)).toBeNull();
  });

  it('switches the pick when a different chip is clicked', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /I'm stuck/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Need a verdict/i }));
    expect(screen.queryByText(/Persona Battle/i)).toBeNull();
    expect(screen.getByText(/Persona Dilemma/i)).toBeInTheDocument();
  });

  it('honors the "Try another mood" reset button', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Just curious/i }));
    fireEvent.click(screen.getByRole('button', { name: /Try another mood/i }));
    expect(screen.queryByText(/Try it/)).toBeNull();
  });
});