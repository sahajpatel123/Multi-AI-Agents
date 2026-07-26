import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompareFromMood } from './CompareFromMood';
import {
  compareAlternativesForMood,
  compareUrlForMood,
} from '../lib/compareFromMood';

describe('compareFromMood (pure helpers)', () => {
  it('returns alts for the stuck (versus) mood', () => {
    const alts = compareAlternativesForMood('stuck');
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) {
      expect(a.category).toBe('versus');
    }
  });

  it('excludes the mood primary from the alts', () => {
    const alts = compareAlternativesForMood('stuck');
    for (const a of alts) {
      expect(a.path).not.toBe('/persona-battle');
    }
  });

  it('honors the limit option', () => {
    expect(compareAlternativesForMood('verdict', { limit: 1 }).length).toBeLessThanOrEqual(1);
  });

  it('returns null URL for an unknown mood', () => {
    expect(compareUrlForMood('not-a-mood')).toBeNull();
  });

  it('returns a compare URL with both paths prefilled', () => {
    const url = compareUrlForMood('verdict');
    expect(url).not.toBeNull();
    expect(url).toContain('/persona-playground/compare');
    expect(url).toContain('a=');
    expect(url).toContain('b=');
  });
});

describe('CompareFromMood widget', () => {
  it('renders chips for each alternative', () => {
    render(
      <MemoryRouter>
        <CompareFromMood moodId="stuck" />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    // The primary CTA must exist.
    expect(screen.getByText(/Compare them/i)).toBeInTheDocument();
  });

  it('renders nothing for an unknown mood', () => {
    const { container } = render(
      <MemoryRouter>
        <CompareFromMood moodId="not-a-mood" />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Or compare against" eyebrow', () => {
    render(
      <MemoryRouter>
        <CompareFromMood moodId="verdict" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Or compare against/i)).toBeInTheDocument();
  });

  it('renders a Swap button when more than one alt is visible', () => {
    render(
      <MemoryRouter>
        <CompareFromMood moodId="stuck" limit={2} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Swap the comparison partner/i })).toBeInTheDocument();
  });

  it('hides the Show all button when there are no more alts', () => {
    render(
      <MemoryRouter>
        <CompareFromMood moodId="stuck" limit={10} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /Show all/i })).toBeNull();
  });
});