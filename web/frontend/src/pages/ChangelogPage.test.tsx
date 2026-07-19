import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChangelogPage } from './ChangelogPage';

const navigateMock = vi.fn();

vi.mock('../components/Navbar', () => ({
  Navbar: () => <header data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ChangelogPage />
    </MemoryRouter>,
  );
}

describe('ChangelogPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('renders Navbar + main + Footer', () => {
    renderPage();
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('exposes a main landmark with id="main-content"', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('renders the hero with the Changelog title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeInTheDocument();
  });

  it('renders all 7 changelog entries as <article> elements', () => {
    const { container } = renderPage();
    const articles = container.querySelectorAll('article.changelog-entry');
    // The data is a hardcoded array of 7 entries (v0.1 through v0.7).
    expect(articles.length).toBe(7);
  });

  it('marks the latest entry with the --latest modifier', () => {
    const { container } = renderPage();
    const latest = container.querySelector('.changelog-entry--latest');
    expect(latest).toBeTruthy();
    // The latest entry's badge is "Latest".
    expect(latest?.textContent).toMatch(/Latest/);
  });

  it('renders the version chip for each entry', () => {
    const { container } = renderPage();
    const versions = Array.from(
      container.querySelectorAll('.changelog-entry__version'),
    ).map((el) => el.textContent?.trim() ?? '');
    // The hardcoded list starts at v0.7 and goes back to v0.1.
    expect(versions).toEqual(['v0.7', 'v0.6', 'v0.5', 'v0.4', 'v0.3', 'v0.2', 'v0.1']);
  });

  it('renders the changelog-item__tag with the right kind modifier for NEW / IMPROVED / FIX', () => {
    const { container } = renderPage();
    // The hardcoded data has [NEW], [IMPROVED], and at least one each.
    const newTags = container.querySelectorAll('.changelog-item__tag--new');
    const improvedTags = container.querySelectorAll('.changelog-item__tag--improved');
    expect(newTags.length).toBeGreaterThan(0);
    expect(improvedTags.length).toBeGreaterThan(0);
    // The visible label is the human form ("New", "Improved").
    expect(newTags[0].textContent).toBe('New');
    expect(improvedTags[0].textContent).toBe('Improved');
  });

  it('uses the BEM class tree on the page shell', () => {
    const { container } = renderPage();
    expect(container.querySelector('.changelog-page')).toBeTruthy();
    expect(container.querySelector('.changelog-page__main')).toBeTruthy();
    expect(container.querySelector('.changelog-page__hero')).toBeTruthy();
    expect(container.querySelector('.changelog-page__title')).toBeTruthy();
    expect(container.querySelector('.changelog-timeline')).toBeTruthy();
    expect(container.querySelector('.changelog-card')).toBeTruthy();
    expect(container.querySelector('.changelog-item')).toBeTruthy();
  });
});
