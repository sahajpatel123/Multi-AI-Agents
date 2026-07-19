import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { useAuth } from '../hooks/useAuth';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';

const STORY_CARDS = [
  {
    index: '01',
    title: 'The problem',
    variant: 'beige' as const,
    body: 'Single-answer AI experiences can optimize for agreement and echo your framing. Arena is built around a different principle — structured disagreement can surface stronger alternatives.',
  },
  {
    index: '02',
    title: 'The approach',
    variant: 'paper' as const,
    body: 'Leading models are matched to persona styles. The minds do not coordinate — they compete. A scorer ranks them. You can debate, focus on one mind, or open Agent Mode for long-form research.',
  },
  {
    index: '03',
    title: 'What ships today',
    variant: 'ink' as const,
    body: 'Arena panel, debate, focus chat, 16 personas, Watchlist (recurring research), Saved takes, Rooms (collaboration), and Agent Mode (plan through judge) are live — with calibration so Arena learns how you evaluate answers. Local computer agency stays with Condura — free, on your machine — not a cloud desktop or browser shim.',
  },
];

export function AboutPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();

  const goArena = () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    setRedirectIntent('/app');
    navigate('/signin?tab=signup');
  };

  return (
    <div className="about-page">
      <div className="about-page__orbs" aria-hidden="true">
        <div className="about-page__orb about-page__orb--a" />
        <div className="about-page__orb about-page__orb--b" />
      </div>
      <Navbar />

      <main
        id="main-content"
        className={`about-main${reduceMotion ? '' : ' about-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="about-title"
      >
        <section className="about-hero">
          <p className="about-hero__kicker">
            <span className="about-hero__kicker-dot" aria-hidden="true" />
            The story behind Arena
          </p>

          <h1 id="about-title" className="about-hero__title">
            <span className="about-hero__title-line">Reasoning,</span>
            <span className="about-hero__title-line about-hero__title-line--accent">
              made visible.
            </span>
          </h1>

          <div className="about-hero__lede">
            <p>
              Arena started as a simple question: why do we accept a single
              AI&apos;s answer when we know every perspective is shaped by
              assumptions? Most AI tools are optimized to agree with you.
              Arena is built to challenge you.
            </p>
            <p>
              Multiple minds answer in parallel, a scorer ranks them, and you
              can debate or dig deeper. Agent Mode runs a seven-stage research
              pipeline for harder questions — still on the web, still honest
              about what the browser cannot do.
            </p>
            <p>
              On-device work (local apps, files, long machine loops) routes to
              Condura. Arena never pretends to control your computer from the
              browser.
            </p>
          </div>

          <div className="about-hero__minds" aria-hidden="true">
            <span className="about-hero__minds-label">Four default minds</span>
            <div className="about-hero__minds-dots">
              <span className="about-hero__minds-dot" />
              <span className="about-hero__minds-dot" />
              <span className="about-hero__minds-dot" />
              <span className="about-hero__minds-dot" />
            </div>
          </div>
          <div className="about-hero__actions">
            <MotionButton type="button" variant="primary" size="md" onClick={goArena}>
              Start with four minds →
            </MotionButton>
            <button
              type="button"
              className="arena-btn arena-btn--ghost arena-btn--md"
              onClick={() => navigate('/product')}
            >
              Explore product
            </button>
          </div>
        </section>

        <section className="about-story" aria-labelledby="about-story-heading">
          <h2 id="about-story-heading" className="about-story__heading">
            What Arena actually is
          </h2>
          <p className="about-story__sub">
            Three beats — the problem, the approach, and what you can use today.
          </p>

          <div className="about-story__grid">
            {STORY_CARDS.map((card) => (
              <article
                key={card.index}
                className={`about-story-card about-story-card--${card.variant}`}
              >
                <div className="about-story-card__index" aria-hidden>
                  {card.index}
                </div>
                <h3 className="about-story-card__title">{card.title}</h3>
                <p className="about-story-card__body">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-cta" aria-labelledby="about-cta-heading">
          <p id="about-cta-heading" className="about-cta__pitch">
            Arena is live and free to try.
          </p>
          <p className="about-cta__sub">
            No card required. Start with four minds — go deeper when you want.
          </p>
          <div className="about-cta__actions">
            <MotionButton type="button" variant="primary" size="md" onClick={goArena}>
              Try Arena →
            </MotionButton>
            <button
              type="button"
              className="arena-btn arena-btn--secondary arena-btn--md"
              onClick={() => navigate('/product')}
            >
              How it works
            </button>
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