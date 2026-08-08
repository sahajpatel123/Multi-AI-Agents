import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SurpriseButton, SURPRISE_CATALOG_SIZE } from './SurpriseButton';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  pickFeaturedOfDay,
} from '../data/personaPlayground';

describe('SurpriseButton', () => {
  it('renders a link to a non-featured catalog tool', () => {
    const featured = pickFeaturedOfDay(new Date(2026, 6, 25));
    render(
      <MemoryRouter>
        <SurpriseButton date={new Date(2026, 6, 25)} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(1);
    const href = links[0]?.getAttribute('href') ?? '';
    expect(href.startsWith('/persona-')).toBe(true);
    expect(
      PERSONA_PLAYGROUND_ENTRIES.some((e) => e.path === href),
    ).toBe(true);
    if (featured) {
      expect(href).not.toBe(featured.path);
    }
  });

  it('renders the default label "Try a different tool"', () => {
    render(
      <MemoryRouter>
        <SurpriseButton date={new Date(2026, 6, 25)} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Try a different tool/)).toBeInTheDocument();
  });

  it('honors a custom label', () => {
    render(
      <MemoryRouter>
        <SurpriseButton date={new Date(2026, 6, 25)} label="Surprise me" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Surprise me/)).toBeInTheDocument();
  });

  it('renders the "Today" pill', () => {
    render(
      <MemoryRouter>
        <SurpriseButton date={new Date(2026, 6, 25)} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/^Today$/)).toBeInTheDocument();
  });

  it('includes the tool format in the rendered output', () => {
    render(
      <MemoryRouter>
        <SurpriseButton date={new Date(2026, 6, 25)} />
      </MemoryRouter>,
    );
    const allText = document.body.textContent ?? '';
    const hasFormat = PERSONA_PLAYGROUND_ENTRIES.some((e) =>
      allText.includes(`· ${e.format}`),
    );
    expect(hasFormat).toBe(true);
  });

  it('is deterministic for the same date', () => {
    const date = new Date(2026, 6, 25);
    const { unmount } = render(
      <MemoryRouter>
        <SurpriseButton date={date} />
      </MemoryRouter>,
    );
    const firstHref = screen.getAllByRole('link')[0]?.getAttribute('href');
    unmount();
    render(
      <MemoryRouter>
        <SurpriseButton date={date} />
      </MemoryRouter>,
    );
    const secondHref = screen.getAllByRole('link')[0]?.getAttribute('href');
    expect(firstHref).toBe(secondHref);
  });

  it('exposes SURPRISE_CATALOG_SIZE matching the catalog', () => {
    expect(SURPRISE_CATALOG_SIZE).toBe(PERSONA_PLAYGROUND_ENTRIES.length);
  });
});
