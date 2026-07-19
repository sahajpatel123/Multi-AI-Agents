import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { useAuth } from '../hooks/useAuth';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';

const TOPOLOGIES = [
  {
    num: 'M-01',
    title: 'Debate Mode',
    body: 'Force competing reasoning personas to cross-examine each other across multiple turns; the exchange can surface premise gaps a single pass might miss.',
    points: [
      'Adversarial multi-turn reactions',
      'Stance and logic under pressure',
      'Challenge any mind from the panel',
    ],
  },
  {
    num: 'M-02',
    title: 'Focus Mode',
    body: 'Isolate one persona in a private 1-on-1 follow-up thread — a dedicated lane optimized for deep context and zero competing noise.',
    points: [
      'Private follow-up with one mind',
      'High-context continuation',
      'Direct dig into any take',
    ],
  },
  {
    num: 'M-03',
    title: 'Agent Mode',
    body: 'Trigger a 7-stage research pipeline designed to turn a broad question into a sourced, judged, structured brief.',
    points: [
      'Autonomous objective parsing',
      'Continuous multi-stage synthesis',
      'Self-correcting critique loops',
    ],
  },
] as const;

const PIPELINE = [
  { num: '01', name: 'Planner', body: 'Deconstructs the prompt into architectural task limits.' },
  { num: '02', name: 'Researcher', body: 'Gathers and cross-checks core parameters from the field.' },
  { num: '03', name: 'Solver', body: 'Runs multi-provider generation across concurrent lanes.' },
  { num: '04', name: 'Critic', body: 'Attacks the draft for gaps, weak evidence, and drift.' },
  { num: '05', name: 'Verifier', body: 'Checks load-bearing claims against cited sources.' },
  { num: '06', name: 'Synthesizer', body: 'Combines tracks into one coherent brief.' },
  { num: '07', name: 'Judge', body: 'Scores the output across structural quality vectors.' },
] as const;

const SURFACE_FEATURES = [
  {
    title: '16 personas',
    body: 'Swap the panel any time. Free unlocks six starter minds; Plus opens the full library.',
  },
  {
    title: 'Watchlist',
    body: 'Turn research into recurring checks. Arena only surfaces updates when findings actually change.',
  },
  {
    title: 'Rooms',
    body: 'Collaborate on a shared board — assign tasks, synthesise takes, keep context with the team.',
  },
  {
    title: 'Calibration',
    body: 'Rate Agent answers; Arena learns how you evaluate quality and tunes confidence display.',
  },
  {
    title: 'Saved takes',
    body: 'Bookmark the answers worth revisiting — export, share, or return without re-running.',
  },
  {
    title: 'Condura handoff',
    body: 'Local computer agency stays free and on your machine. The browser never fakes device control.',
  },
] as const;

export function CapabilitiesPage() {
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
    <div className="mkt-page">
      <Navbar />

      <main
        id="main-content"
        className={`mkt-main${reduceMotion ? '' : ' mkt-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="capabilities-title"
      >
        <section className="mkt-hero">
          <p className="mkt-hero__kicker">
            <span className="mkt-hero__kicker-dot" aria-hidden="true" />
            Capabilities
          </p>
          <h1 id="capabilities-title" className="mkt-hero__title">
            Everything Arena can <span className="mkt-hero__accent">do.</span>
          </h1>
          <p className="mkt-hero__lede">
            Debate, focus, research pipelines, watchlists, rooms, and honest on-device handoffs —
            one product surface for thinking that does not collapse to a single agreeable voice.
          </p>
          <ul className="mkt-hero__proof" aria-hidden="true">
            <li className="mkt-hero__proof-item">3 run modes</li>
            <li className="mkt-hero__proof-item">7-stage pipeline</li>
            <li className="mkt-hero__proof-item">16 personas</li>
          </ul>
          <div className="mkt-hero__actions">
            <MotionButton type="button" variant="primary" size="md" onClick={goArena}>
              Try Arena →
            </MotionButton>
            <button
              type="button"
              className="arena-btn arena-btn--ghost arena-btn--md"
              onClick={() => navigate('/pricing')}
            >
              Compare plans
            </button>
          </div>
        </section>

        <section className="cap-section" aria-labelledby="cap-topo-heading">
          <div className="cap-section__head">
            <span className="mkt-eyebrow">Execution topologies</span>
            <h2 id="cap-topo-heading" className="cap-section__title">
              Three ways to run a question
            </h2>
            <p className="cap-section__lede">
              Isolate a mind, force multi-turn adversarial passes, or launch a full research
              pipeline — without switching products.
            </p>
          </div>
          <div className="cap-topo-grid">
            {TOPOLOGIES.map((mode) => (
              <article key={mode.num} className="cap-topo-card">
                <h3 className="cap-topo-card__title">
                  <span className="cap-topo-card__num">{mode.num}</span>
                  {mode.title}
                </h3>
                <p className="cap-topo-card__body">{mode.body}</p>
                <ul className="cap-topo-card__list">
                  {mode.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="cap-section cap-section--tint" aria-labelledby="cap-pipe-heading">
          <div className="cap-section__head">
            <span className="mkt-eyebrow">Agent Mode internals</span>
            <h2 id="cap-pipe-heading" className="cap-section__title">
              The 7-stage research matrix
            </h2>
            <p className="cap-section__lede">
              One question triggers plan, research, solve, critique, verify, synthesise, and judge —
              so the brief is stress-tested before you use it.
            </p>
          </div>
          <div className="cap-pipeline-grid">
            {PIPELINE.map((stage) => (
              <article key={stage.num} className="cap-pipeline-card">
                <div className="cap-pipeline-card__num">{stage.num}</div>
                <h3 className="cap-pipeline-card__name">{stage.name}</h3>
                <p className="cap-pipeline-card__body">{stage.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cap-section" aria-labelledby="cap-surface-heading">
          <div className="cap-section__head">
            <span className="mkt-eyebrow">Product surface</span>
            <h2 id="cap-surface-heading" className="cap-section__title">
              Built for real usage, not demos
            </h2>
          </div>
          <div className="cap-feature-grid">
            {SURFACE_FEATURES.map((f) => (
              <article key={f.title} className="cap-feature-card">
                <h3 className="cap-feature-card__title">{f.title}</h3>
                <p className="cap-feature-card__body">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mkt-cta-block" aria-labelledby="cap-cta-heading">
          <p id="cap-cta-heading" className="mkt-cta-block__pitch">
            Ready to put four minds on a real question?
          </p>
          <p className="mkt-cta-block__sub">Free to try — no card required.</p>
          <div className="mkt-cta-row">
            <MotionButton type="button" variant="primary" size="md" onClick={goArena}>
              Try Arena →
            </MotionButton>
            <button
              type="button"
              className="arena-btn arena-btn--secondary arena-btn--md"
              onClick={() => navigate('/product')}
            >
              Product overview
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
