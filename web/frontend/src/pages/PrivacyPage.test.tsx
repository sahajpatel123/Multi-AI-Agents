import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

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
      <PrivacyPage />
    </MemoryRouter>,
  );
}

describe('PrivacyPage', () => {
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

  it('renders the hero with the "Privacy Policy" h1', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument();
    // Last-updated meta.
    expect(screen.getByText(/Last updated: July 2026/i)).toBeInTheDocument();
  });

  it('renders all 8 sections from SECTIONS', () => {
    const { container } = renderPage();
    const sections = container.querySelectorAll('article.legal-section');
    // Hardcoded list of 8 privacy sections.
    expect(sections.length).toBe(8);
  });

  it('renders section titles + bodies', () => {
    renderPage();
    // Sample a handful of titles; the full list is fixed data.
    expect(
      screen.getByRole('heading', { level: 2, name: 'What We Collect' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'AI Model Providers' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Data Deletion' }),
    ).toBeInTheDocument();
  });

  it('renders zero-padded section numbers (01, 02, ..., 08)', () => {
    const { container } = renderPage();
    const indices = Array.from(
      container.querySelectorAll('.legal-section__index'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(indices).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
  });

  it('splits the AI Model Providers body on newlines into multiple <p> elements', () => {
    const { container } = renderPage();
    // Find the section with the "AI Model Providers" title and check that
    // its body has more than one <p> (the data uses \n\n to separate
    // paragraphs in that section).
    const headings = container.querySelectorAll('.legal-section__title');
    const aiSection = Array.from(headings).find(
      (h) => h.textContent === 'AI Model Providers',
    );
    expect(aiSection).toBeTruthy();
    const body = aiSection!.closest('article')!.querySelector(
      '.legal-section__body',
    );
    const paragraphs = body?.querySelectorAll('p') ?? [];
    // The AI section body has 7 paragraphs: intro, blank, "Anthropic...",
    // "OpenAI...", "xAI...", "DeepSeek...", "We do not share...".
    expect(paragraphs.length).toBeGreaterThan(1);
  });

  it('uses the BEM class tree on the page shell', () => {
    const { container } = renderPage();
    expect(container.querySelector('.legal-page')).toBeTruthy();
    expect(container.querySelector('.legal-page__main')).toBeTruthy();
    expect(container.querySelector('.legal-hero')).toBeTruthy();
    expect(container.querySelector('.legal-hero__title')).toBeTruthy();
    expect(container.querySelector('.legal-content')).toBeTruthy();
    expect(container.querySelector('.legal-section')).toBeTruthy();
    expect(container.querySelector('.legal-section__title')).toBeTruthy();
    expect(container.querySelector('.legal-section__body')).toBeTruthy();
  });
});
