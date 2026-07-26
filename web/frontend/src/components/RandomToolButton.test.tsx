import { describe, expect, it, vi } from 'vitest';
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

  it('renders the Shift + R shortcut chip by default', () => {
    render(
      <MemoryRouter>
        <RandomToolButton />
      </MemoryRouter>,
    );
    expect(screen.getByText('Shift + R')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).toContain('Shift + R');
  });

  it('omits the shortcut chip when showShortcut is false', () => {
    render(
      <MemoryRouter>
        <RandomToolButton showShortcut={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Shift + R')).toBeNull();
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).not.toContain('Shift + R');
  });

  it('uses the supplied pick when one is provided', () => {
    const entry = PERSONA_PLAYGROUND_ENTRIES[0];
    render(
      <MemoryRouter>
        <RandomToolButton pick={entry} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(entry.path);
    expect(link.getAttribute('aria-label')).toContain(entry.name);
  });

  it('does not render a Reshuffle button when onReshuffle is omitted', () => {
    render(
      <MemoryRouter>
        <RandomToolButton />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /reshuffle/i })).toBeNull();
  });

  it('renders a Reshuffle button when onReshuffle is provided and fires on click', () => {
    const onReshuffle = vi.fn();
    render(
      <MemoryRouter>
        <RandomToolButton onReshuffle={onReshuffle} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /reshuffle/i });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onReshuffle).toHaveBeenCalledTimes(1);
  });

  it('honors a custom reshuffle aria label', () => {
    render(
      <MemoryRouter>
        <RandomToolButton
          onReshuffle={() => {}}
          reshuffleAriaLabel="Pick a different tool"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Pick a different tool/i })).toBeInTheDocument();
  });
});
