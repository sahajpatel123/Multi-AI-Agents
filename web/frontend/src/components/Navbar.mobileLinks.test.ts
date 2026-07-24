import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) => readFileSync(join(here, relativePath), 'utf8');

describe('shared public Prism navigation (source structure)', () => {
  it('owns the landing mast geometry and accessible menu behavior in one component', () => {
    const src = readSource('Navbar.tsx');

    expect(src).toContain('data-public-prism-nav');
    expect(src).toContain('className="vp-mast vp-public-nav"');
    expect(src).toContain('aria-controls="public-prism-menu"');
    expect(src).toContain("event.key === 'Escape'");
    expect(src).toContain("document.body.style.overflow = 'hidden'");
    expect(src).toContain('closeMenuButtonRef.current?.focus()');
    expect(src).toContain("element.setAttribute('inert', '')");
    expect(src).toContain('dialog.querySelectorAll<HTMLElement>');
    expect(src).toContain('className="vp-menu-close"');
    expect(src).toContain('menuButtonRef.current?.focus()');
    expect(src).toContain("{ label: 'PRODUCT', path: '/product' }");
    expect(src).toContain("{ label: 'MATCH', path: '/persona-match' }");
    expect(src).toContain("{ label: 'BATTLE', path: '/persona-battle' }");
    expect(src).toContain("{ label: 'WHEEL', path: '/persona-wheel' }");
    expect(src).toContain("{ label: 'TRIVIA', path: '/persona-trivia' }");
    expect(src).toContain("{ number: '04', label: 'Persona Match', path: '/persona-match' }");
    expect(src).toContain("{ number: '05', label: 'Persona Battle', path: '/persona-battle' }");
    expect(src).toContain("{ number: '06', label: 'Persona Wheel', path: '/persona-wheel' }");
    expect(src).toContain("{ number: '07', label: 'Persona Trivia', path: '/persona-trivia' }");
    expect(src).toContain("{ number: '10', label: 'About', path: '/about' }");
    expect(src).toContain("{ number: '11', label: 'Changelog', path: '/changelog' }");
    expect(src).not.toContain('navbar-inner-container');
  });

  it('is mounted by Home and every redesigned public destination', () => {
    const pages = [
      'HomePage.tsx',
      'PricingPage.tsx',
      'ProductPage.tsx',
      'CapabilitiesPage.tsx',
      'PersonasPage.tsx',
      'DocsPage.tsx',
      'AboutPage.tsx',
      'ChangelogPage.tsx',
    ];

    for (const page of pages) {
      const src = readSource(`../pages/${page}`);
      expect(src, `${page} imports shared Navbar`).toContain("import { Navbar } from '../components/Navbar'");
      expect(src, `${page} mounts shared Navbar`).toContain('<Navbar />');
    }

    const home = readSource('../pages/HomePage.tsx');
    expect(home).not.toContain('<header className="vp-mast">');
    expect(home).not.toContain('setMenuOpen');
  });
});
