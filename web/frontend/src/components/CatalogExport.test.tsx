import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogExport } from './CatalogExport';
import {
  renderCatalogMarkdown,
  renderCatalogJson,
  renderCatalog,
  catalogFilename,
  downloadCatalog,
} from '../lib/catalogExport';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

describe('catalogExport (pure helpers)', () => {
  it('renders a non-empty Markdown catalog', () => {
    const md = renderCatalogMarkdown();
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain('# Persona Playground catalog');
    for (const entry of PERSONA_PLAYGROUND_ENTRIES.slice(0, 3)) {
      expect(md).toContain(entry.name);
    }
  });

  it('renders a valid JSON array', () => {
    const json = renderCatalogJson();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(PERSONA_PLAYGROUND_ENTRIES.length);
    // Sorted alphabetically by name.
    const names = parsed.map((r: { name: string }) => r.name);
    const sorted = [...names].sort((a, b) => String(a).localeCompare(String(b)));
    expect(names).toEqual(sorted);
  });

  it('renderCatalog dispatches by format', () => {
    expect(renderCatalog('markdown')).toBe(renderCatalogMarkdown());
    expect(renderCatalog('json')).toBe(renderCatalogJson());
  });

  it('catalogFilename includes the date and correct extension', () => {
    expect(catalogFilename('markdown')).toMatch(/\.md$/);
    expect(catalogFilename('json')).toMatch(/\.json$/);
    expect(catalogFilename('markdown')).toMatch(/persona-playground-\d{4}-\d{2}-\d{2}\.md$/);
  });
});

describe('CatalogExport widget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the default heading + Markdown selected', () => {
    render(<CatalogExport />);
    expect(screen.getByText(/Take the catalog with you/i)).toBeInTheDocument();
    const md = screen.getByRole('radio', { name: /Markdown/i });
    expect(md).toBeChecked();
  });

  it('switches format when JSON is selected', () => {
    render(<CatalogExport />);
    fireEvent.click(screen.getByRole('radio', { name: /JSON/i }));
    expect(screen.getByRole('radio', { name: /JSON/i })).toBeChecked();
  });

  it('downloads the catalog and flips the button label', async () => {
    // Mock the link.click() so jsdom doesn't try to navigate.
    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'a') {
          const el = originalCreate('a') as HTMLAnchorElement;
          el.click = clickSpy;
          return el;
        }
        return originalCreate(tag);
      });
    render(<CatalogExport />);
    fireEvent.click(screen.getByRole('button', { name: /Download catalog/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Catalog downloaded/i })).toBeInTheDocument(),
    );
    expect(clickSpy).toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('reflects the export format in the button label', () => {
    render(<CatalogExport />);
    expect(screen.getByRole('button', { name: /Download catalog/i }).textContent).toMatch(/\.md/);
    fireEvent.click(screen.getByRole('radio', { name: /JSON/i }));
    expect(screen.getByRole('button', { name: /Download catalog/i }).textContent).toMatch(/\.json/);
  });

  it('downloadCatalog returns false when window/document are unavailable', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error — simulate no-window environment
    delete (globalThis as { window?: unknown }).window;
    expect(downloadCatalog('markdown')).toBe(false);
    ;(globalThis as { window?: unknown }).window = originalWindow;
  });
});