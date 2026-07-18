import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { prefersReducedMotion } from '../lib/motion';

const ARENA_FEATURES = [
  'Four AI personas compete simultaneously',
  'Scored and ranked automatically',
  'Challenge, debate, or go 1-on-1',
  'Winner surfaces with a reason why',
] as const;

const AGENT_FEATURES = [
  '8-stage web research pipeline',
  'Plan → Research → Steelman → Solve → Critique → Verify → Synthesise → Judge',
  'Verifier checks every claim before it ships',
  'On-device work routes to Condura — not the browser',
] as const;

export function ProductPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();

  const go = (path: string) => {
    if (isAuthenticated) {
      navigate(path);
      return;
    }
    setRedirectIntent(path);
    navigate('/signin?tab=signup');
  };

  return (
    <div className="mkt-page">
      <Navbar />

      <main
        id="main-content"
        className={`mkt-main${reduceMotion ? '' : ' mkt-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="product-title"
      >
        <section className="mkt-hero">
          <p className="mkt-hero__kicker">
            <span className="mkt-hero__kicker-dot" aria-hidden="true" />
            Choose your mode
          </p>
          <h1 id="product-title" className="mkt-hero__title">
            Two ways to <span className="mkt-hero__accent">think.</span>
          </h1>
          <p className="mkt-hero__lede">
            Arena for debate. Agent for depth. Same intelligence, two different engines — pick the
            shape of work, not a different product.
          </p>
          <ul className="mkt-hero__proof" aria-hidden="true">
            <li className="mkt-hero__proof-item">Free to try</li>
            <li className="mkt-hero__proof-item">Same account</li>
            <li className="mkt-hero__proof-item">Switch anytime</li>
          </ul>
        </section>

        <section className="product-modes" aria-label="Product modes">
          <button
            type="button"
            className="product-mode-card product-mode-card--arena"
            onClick={() => go('/app')}
          >
            <span className="product-mode-card__badge">
              <span className="product-mode-card__badge-dot" aria-hidden="true" />
              Active now
            </span>
            <span className="product-mode-card__num" aria-hidden>
              01
            </span>
            <h2 className="product-mode-card__title">Arena Mode</h2>
            <p className="product-mode-card__tagline">Four minds. One question.</p>
            <ul className="product-mode-card__list">
              {ARENA_FEATURES.map((f) => (
                <li key={f}>
                  <span className="product-mode-card__check" aria-hidden>
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <span className="product-mode-card__cta">Enter Arena →</span>
          </button>

          <button
            type="button"
            className="product-mode-card product-mode-card--agent"
            onClick={() => go('/agent')}
          >
            <span className="product-mode-card__badge product-mode-card__badge--agent">
              <span className="product-mode-card__badge-dot" aria-hidden="true" />
              Active now
            </span>
            <span className="product-mode-card__num product-mode-card__num--agent" aria-hidden>
              02
            </span>
            <h2 className="product-mode-card__title">Agent Mode</h2>
            <p className="product-mode-card__tagline product-mode-card__tagline--agent">
              Plan. Research. Solve. Verify.
            </p>
            <ul className="product-mode-card__list">
              {AGENT_FEATURES.map((f) => (
                <li key={f}>
                  <span
                    className="product-mode-card__check product-mode-card__check--agent"
                    aria-hidden
                  >
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <span className="product-mode-card__cta product-mode-card__cta--agent">
              Enter Agent →
            </span>
          </button>
        </section>

        <section className="product-compare" aria-labelledby="product-compare-heading">
          <h2 id="product-compare-heading" className="product-compare__heading">
            Not sure which to use?
          </h2>
          <div className="product-compare__pills">
            <span className="product-compare__pill">Arena → opinions, decisions, debate</span>
            <span className="product-compare__pill product-compare__pill--agent">
              Agent → research, briefs, complex tasks
            </span>
          </div>
          <div className="mkt-cta-row">
            <MotionButton
              type="button"
              variant="secondary"
              size="md"
              onClick={() => navigate('/capabilities')}
            >
              See all capabilities
            </MotionButton>
            <button
              type="button"
              className="arena-btn arena-btn--ghost arena-btn--md"
              onClick={() => navigate('/pricing')}
            >
              Pricing
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
