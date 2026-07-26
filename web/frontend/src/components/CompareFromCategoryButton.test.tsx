import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompareFromCategoryButton } from './CompareFromCategoryButton';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

describe('CompareFromCategoryButton', () => {
  it('renders a link to /persona-playground/compare with a= and b= params', () => {
    render(
      <MemoryRouter>
        <CompareFromCategoryButton />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(1);
    const href = links[0]?.getAttribute('href') ?? '';
    expect(href.startsWith('/persona-playground/compare?')).toBe(true);
    expect(href).toContain('a=');
    expect(href).toContain('b=');
  });

  it('renders the default label', () => {
    render(
      <MemoryRouter>
        <CompareFromCategoryButton />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Compare two from a category/)).toBeInTheDocument();
  });

  it('honors a custom label', () => {
    render(
      <MemoryRouter>
        <CompareFromCategoryButton label="Compare these" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Compare these/)).toBeInTheDocument();
  });

  it('renders a compare link with a= and b= pointing at distinct paths', () => {
    render(
      <MemoryRouter>
        <CompareFromCategoryButton />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    const href = links[0]?.getAttribute('href') ?? '';
    const aMatch = /[?&]a=([^&]+)/.exec(href);
    const bMatch = /[?&]b=([^&]+)/.exec(href);
    expect(aMatch).not.toBeNull();
    expect(bMatch).not.toBeNull();
    const a = decodeURIComponent(aMatch?.[1] ?? '');
    const b = decodeURIComponent(bMatch?.[1] ?? '');
    expect(a.startsWith('/persona-')).toBe(true);
    expect(b.startsWith('/persona-')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('renders nothing when excludePaths covers the entire catalog', () => {
    const allPaths = PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path);
    render(
      <MemoryRouter>
        <CompareFromCategoryButton excludePaths={allPaths} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is deterministic for the same date + salt', () => {
    const date = new Date(2026, 6, 25);
    const { unmount } = render(
      <MemoryRouter>
        <CompareFromCategoryButton date={date} salt={0} />
      </MemoryRouter>,
    );
    const firstHref = screen.getAllByRole('link')[0]?.getAttribute('href');
    unmount();
    render(
      <MemoryRouter>
        <CompareFromCategoryButton date={date} salt={0} />
      </MemoryRouter>,
    );
    const secondHref = screen.getAllByRole('link')[0]?.getAttribute('href');
    expect(firstHref).toBe(secondHref);
  });
});
