import { describe, expect, it, vi } from 'vitest';
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

  it('moves focus and selection with ArrowRight', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    const stuck = screen.getByRole('radio', { name: /I'm stuck/i });
    stuck.focus();
    fireEvent.keyDown(stuck, { key: 'ArrowRight' });
    expect(screen.getByText(/Persona Confessional/i)).toBeInTheDocument();
  });

  it('wraps ArrowLeft from the first chip to the last', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    const stuck = screen.getByRole('radio', { name: /I'm stuck/i });
    stuck.focus();
    fireEvent.keyDown(stuck, { key: 'ArrowLeft' });
    expect(screen.getByText(/Persona Wheel/i)).toBeInTheDocument();
  });

  it('honors Home/End keyboard shortcuts', () => {
    render(
      <MemoryRouter>
        <MoodMatcher />
      </MemoryRouter>,
    );
    const inspired = screen.getByRole('radio', { name: /Want inspiration/i });
    inspired.focus();
    fireEvent.keyDown(inspired, { key: 'Home' });
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
  });

  it('pre-selects from the ?mood= URL param when syncUrl is on', () => {
    render(
      <MemoryRouter initialEntries={['/persona-playground?mood=verdict']}>
        <MoodMatcher syncUrl />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Persona Dilemma/i)).toBeInTheDocument();
  });

  it('ignores invalid ?mood= values', () => {
    render(
      <MemoryRouter initialEntries={['/persona-playground?mood=garbage']}>
        <MoodMatcher syncUrl />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Try it/)).toBeNull();
  });

  it('controlled mode: ignores internal clicks when activeId is provided', () => {
    render(
      <MemoryRouter>
        <MoodMatcher activeId="stuck" onActiveChange={() => {}} />
      </MemoryRouter>,
    );
    // Initial pick shows because activeId is 'stuck'.
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
    // Clicking another chip should not change the active pick.
    fireEvent.click(screen.getByRole('radio', { name: /Need a verdict/i }));
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
  });

  it('controlled mode: emits onActiveChange when a chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <MoodMatcher activeId={null} onActiveChange={onChange} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Just curious/i }));
    expect(onChange).toHaveBeenCalledWith('curious');
  });

  it('renders a sectionId when provided', () => {
    const { container } = render(
      <MemoryRouter>
        <MoodMatcher sectionId="ppg-jump-mood" />
      </MemoryRouter>,
    );
    expect(container.querySelector('#ppg-jump-mood')).not.toBeNull();
  });
});