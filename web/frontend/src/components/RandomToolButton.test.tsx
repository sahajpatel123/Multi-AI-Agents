import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RandomToolButton } from './RandomToolButton';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

describe('RandomToolButton', () => {
  it('renders a link to a catalog tool', () => {
    render(
      <MemoryRouter>
        <RandomToolButton />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(1);
    const href = links[0]?.getAttribute('href') ?? '';
    expect(href.startsWith('/persona-')).toBe(true);
    expect(
      PERSONA_PLAYGROUND_ENTRIES.some((e) => e.path === href),
    ).toBe(true);
  });

  it('renders a default label of "Open a random tool"', () => {
    render(
      <MemoryRouter>
        <RandomToolButton />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Open a random tool/)).toBeInTheDocument();
  });

  it('honors a custom label', () => {
    render(
      <MemoryRouter>
        <RandomToolButton label="Shuffle me" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Shuffle me/)).toBeInTheDocument();
  });

  it('includes the tool name in the rendered output', () => {
    render(
      <MemoryRouter>
        <RandomToolButton />
      </MemoryRouter>,
    );
    const strong = document.querySelector('strong');
    expect(strong?.textContent).toBeTruthy();
    expect(
      PERSONA_PLAYGROUND_ENTRIES.some((e) => e.name === strong?.textContent),
    ).toBe(true);
  });

  it('excludes paths supplied in excludePaths', () => {
    for (let i = 0; i < 5; i += 1) {
      const { unmount } = render(
        <MemoryRouter>
          <RandomToolButton excludePaths={['/persona-match']} />
        </MemoryRouter>,
      );
      const links = screen.getAllByRole('link');
      expect(links[0]?.getAttribute('href')).not.toBe('/persona-match');
      unmount();
    }
  });

  it('applies the sm size class by default', () => {
    render(
      <MemoryRouter>
        <RandomToolButton />
      </MemoryRouter>,
    );
    const link = document.querySelector('a.ppg-randombtn');
    expect(link?.className).toContain('ppg-randombtn--sm');
  });

  it('applies the md size class when size is "md"', () => {
    render(
      <MemoryRouter>
        <RandomToolButton size="md" />
      </MemoryRouter>,
    );
    const link = document.querySelector('a.ppg-randombtn');
    expect(link?.className).toContain('ppg-randombtn--md');
  });
});
