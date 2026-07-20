import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/verdict-public-nav.css';

const PRIMARY_LINKS = [
  { label: 'PRODUCT', path: '/product' },
  { label: 'PERSONAS', path: '/personas' },
  { label: 'PRICING', path: '/pricing' },
  { label: 'DOCS', path: '/docs' },
] as const;

const MENU_LINKS = [
  { number: '01', label: 'Product', path: '/product' },
  { number: '02', label: 'Capabilities', path: '/capabilities' },
  { number: '03', label: 'Personas', path: '/personas' },
  { number: '04', label: 'Pricing', path: '/pricing' },
  { number: '05', label: 'Documentation', path: '/docs' },
  { number: '06', label: 'About', path: '/about' },
  { number: '07', label: 'Changelog', path: '/changelog' },
] as const;

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDialogRef = useRef<HTMLDivElement>(null);
  const closeMenuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const inertTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-public-prism-nav], #route-content main, #route-content .site-footer',
      ),
    ).map((element) => ({
      element,
      alreadyInert: element.hasAttribute('inert'),
    }));

    document.body.style.overflow = 'hidden';
    inertTargets.forEach(({ element }) => element.setAttribute('inert', ''));
    const focusTimer = window.setTimeout(
      () => closeMenuButtonRef.current?.focus(),
      0,
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = menuDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      inertTargets.forEach(({ element, alreadyInert }) => {
        if (!alreadyInert) element.removeAttribute('inert');
      });
    };
  }, [menuOpen]);

  useEffect(() => {
    if (wasOpenRef.current && !menuOpen) menuButtonRef.current?.focus();
    wasOpenRef.current = menuOpen;
  }, [menuOpen]);

  const isActive = (path: string) => location.pathname === path;

  const enterArena = () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    setRedirectIntent('/app');
    navigate('/signin?tab=signup');
  };

  const goHome = () => {
    if (location.pathname !== '/') {
      navigate('/');
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <>
      <header className="vp-mast vp-public-nav" data-public-prism-nav>
        <button type="button" className="vp-brand" onClick={goHome} aria-label="Arena home">
          <i aria-hidden="true" />
          ARENA
        </button>

        <nav aria-label="Primary navigation">
          {PRIMARY_LINKS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={isActive(item.path) ? 'is-active' : undefined}
              aria-current={isActive(item.path) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button type="button" className="vp-enter" onClick={enterArena}>
          {isAuthenticated ? 'OPEN ARENA' : 'ENTER ARENA'}
          <ArrowRight aria-hidden="true" />
        </button>
        <button
          ref={menuButtonRef}
          type="button"
          className="vp-menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="public-prism-menu"
          tabIndex={menuOpen ? -1 : 0}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>

      <div className="vp-nav-spacer" aria-hidden="true" />

      <div
        ref={menuDialogRef}
        id="public-prism-menu"
        className={`vp-menu vp-public-menu${menuOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal={menuOpen}
        aria-label="Site navigation"
        aria-hidden={!menuOpen}
      >
        <button
          ref={closeMenuButtonRef}
          type="button"
          className="vp-menu-close"
          aria-label="Close menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => setMenuOpen(false)}
        >
          <X aria-hidden="true" />
        </button>
        <nav aria-label="Expanded navigation">
          {MENU_LINKS.map((item, index) => (
            <Link
              ref={index === 0 ? firstMenuLinkRef : undefined}
              key={item.number}
              to={item.path}
              className={isActive(item.path) ? 'is-active' : undefined}
              aria-current={isActive(item.path) ? 'page' : undefined}
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => setMenuOpen(false)}
            >
              <small>{item.number}</small>
              <strong>{item.label}</strong>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <p aria-hidden="true">
          ONE QUESTION.<br />
          FOUR TRUTHS.<br />
          ONE VERDICT.
        </p>
      </div>
    </>
  );
}
