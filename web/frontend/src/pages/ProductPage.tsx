import { useState, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
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
  '7-stage research pipeline',
  'Plan → Research → Solve → Critique → Verify → Synthesise → Judge',
  'Verifier checks load-bearing claims against sources',
  'On-device work routes to Condura — not the browser',
] as const;

const AGENT_STAGES = ['PLAN', 'RESEARCH', 'SOLVE', 'CRITIQUE', 'VERIFY', 'SYNTHESISE', 'JUDGE'] as const;

const SHOWCASES = [
  {
    id: 'strategy',
    number: '01',
    label: 'STRATEGY',
    question: 'Should we enter the European market this quarter?',
    answers: [
      { mind: 'Analyst', score: 86, tone: '#5ED8FF', copy: 'Demand is real, but support cost is missing from the margin model.' },
      { mind: 'Strategist', score: 92, tone: '#A98CF8', copy: 'Enter through one regulated vertical; make the first move reversible.' },
      { mind: 'Contrarian', score: 84, tone: '#FF6652', copy: 'Waiting for certainty is how incumbents keep the map.' },
      { mind: 'Engineer', score: 90, tone: '#D7F64A', copy: 'Pilot in one country with explicit latency and compliance gates.' },
    ],
    winner: 'Strategist',
    verdict: 'A narrow, reversible entry beats both a continent-wide launch and another quarter of abstract research.',
    confidence: '88%',
    artifact: 'MARKET ENTRY BRIEF',
    evidence: ['12 source leads mapped', '3 viable entry wedges', '2 regulatory blockers surfaced'],
  },
  {
    id: 'product',
    number: '02',
    label: 'PRODUCT',
    question: 'Which feature should we cut before launch?',
    answers: [
      { mind: 'Pragmatist', score: 94, tone: '#D7F64A', copy: 'Cut the feature that adds onboarding work without changing retention.' },
      { mind: 'Empath', score: 87, tone: '#FF6652', copy: 'Do not remove the only path that makes the product usable for novices.' },
      { mind: 'Analyst', score: 91, tone: '#5ED8FF', copy: 'The collaboration layer has the weakest evidence and the largest test surface.' },
      { mind: 'Contrarian', score: 83, tone: '#A98CF8', copy: 'Cut polish, not capability; an ugly useful product still teaches you.' },
    ],
    winner: 'Pragmatist',
    verdict: 'Remove collaboration from v1, preserve novice guidance, and spend the recovered week on activation reliability.',
    confidence: '91%',
    artifact: 'LAUNCH SCOPE MEMO',
    evidence: ['8 user interviews compared', '4 activation paths mapped', '1 release-week failure mode removed'],
  },
  {
    id: 'research',
    number: '03',
    label: 'RESEARCH',
    question: 'Should advanced AI be treated as critical infrastructure?',
    answers: [
      { mind: 'Scientist', score: 89, tone: '#5ED8FF', copy: 'Regulate measurable deployment risk, not an undefined capability label.' },
      { mind: 'Philosopher', score: 87, tone: '#A98CF8', copy: 'The threshold is social dependence, not model intelligence alone.' },
      { mind: 'Contrarian', score: 82, tone: '#FF6652', copy: 'Broad safety rules can freeze today’s leaders in place.' },
      { mind: 'Engineer', score: 93, tone: '#D7F64A', copy: 'Control compute, access, and incident reporting—the observable choke points.' },
    ],
    winner: 'Engineer',
    verdict: 'Treat consequential deployments as infrastructure only where access, reach, and failure reporting can be measured.',
    confidence: '84%',
    artifact: 'POLICY EVIDENCE DOSSIER',
    evidence: ['17 policy sources reconciled', '5 jurisdiction gaps named', '3 enforceable thresholds proposed'],
  },
] as const;

const ROUTING_ROWS = [
  { signal: 'You need disagreement before deciding', mode: 'ARENA', output: '4 takes + scored verdict', tone: '#5ED8FF', path: '/app' },
  { signal: 'You need to challenge a confident answer', mode: 'ARENA / DEBATE', output: 'Adversarial response rounds', tone: '#FF6652', path: '/app' },
  { signal: 'You need a sourced, defensible brief', mode: 'AGENT', output: 'Research artifact + verification', tone: '#A98CF8', path: '/agent' },
  { signal: 'You need the question checked again later', mode: 'AGENT / WATCHLIST', output: 'Change-only recurring update', tone: '#D7F64A', path: '/agent/watchlist' },
] as const;

const PRODUCT_SURFACES = [
  { number: '01', title: 'Panel', body: 'Choose four minds from sixteen reasoning styles. Build for difference, not consensus.', tone: '#5ED8FF' },
  { number: '02', title: 'Judgment', body: 'A fifth model scores relevance, insight, clarity, and honesty—and shows its work.', tone: '#D7F64A' },
  { number: '03', title: 'Debate', body: 'Challenge one answer and watch competing minds pressure-test the response.', tone: '#FF6652' },
  { number: '04', title: 'Focus', body: 'Continue privately with the mind whose reasoning is most useful to you.', tone: '#A98CF8' },
  { number: '05', title: 'Memory', body: 'Keep the decisions, context, and useful takes that should survive the session.', tone: '#F0B84E' },
  { number: '06', title: 'Rooms', body: 'Turn independent research into a shared board with visible synthesis and drift.', tone: '#5ED8FF' },
] as const;

export function ProductPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [showcaseIndex, setShowcaseIndex] = useState(0);
  const showcase = SHOWCASES[showcaseIndex];

  const go = (path: string) => {
    if (isAuthenticated) {
      navigate(path);
      return;
    }
    setRedirectIntent(path);
    navigate('/signin?tab=signup');
  };

  return (
    <div className="mkt-page product-page">
      <Navbar />

      <main
        id="main-content"
        className={`mkt-main${reduceMotion ? '' : ' mkt-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="product-title"
      >
        <section className="mkt-hero product-hero">
          <h1 id="product-title" className="mkt-hero__title">
            Two ways to <span className="mkt-hero__accent">think.</span>
          </h1>
          <p className="mkt-hero__lede">
            Arena for debate. Agent for depth. Same intelligence, two different engines—choose
            the shape of work, not a different product.
          </p>
          <ul className="mkt-hero__proof" aria-hidden="true">
            <li className="mkt-hero__proof-item">Free to try</li>
            <li className="mkt-hero__proof-item">Same account</li>
            <li className="mkt-hero__proof-item">Switch anytime</li>
          </ul>
          <div className="mkt-hero__actions">
            <MotionButton type="button" variant="primary" size="md" onClick={() => go('/app')}>
              Try a live question →
            </MotionButton>
            <a className="arena-btn arena-btn--ghost arena-btn--md" href="#product-showcase">
              See both engines
            </a>
          </div>
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
            <span className="product-mode-card__num" aria-hidden>01</span>
            <h2 className="product-mode-card__title">Arena Mode</h2>
            <p className="product-mode-card__tagline">Four minds. One question.</p>
            <ul className="product-mode-card__list">
              {ARENA_FEATURES.map((feature) => (
                <li key={feature}>
                  <span className="product-mode-card__check" aria-hidden>✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <span className="product-mode-card__cta">Enter Arena</span>
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
            <span className="product-mode-card__num product-mode-card__num--agent" aria-hidden>02</span>
            <h2 className="product-mode-card__title">Agent Mode</h2>
            <p className="product-mode-card__tagline product-mode-card__tagline--agent">
              Plan. Research. Solve. Verify.
            </p>
            <ul className="product-mode-card__list">
              {AGENT_FEATURES.map((feature) => (
                <li key={feature}>
                  <span className="product-mode-card__check product-mode-card__check--agent" aria-hidden>✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <span className="product-mode-card__cta product-mode-card__cta--agent">Enter Agent</span>
          </button>
        </section>

        <section id="product-showcase" className="product-showcase" aria-labelledby="product-showcase-title">
          <header className="product-section-head">
            <div>
              <h2 id="product-showcase-title">See the difference in the output.</h2>
            </div>
            <p>
              Arena exposes competing judgment. Agent builds an evidence-bearing artifact. Change
              the question below and inspect what each engine is designed to return.
            </p>
          </header>

          <div className="product-scenario-tabs" role="group" aria-label="Product showcase scenario">
            {SHOWCASES.map((scenario, index) => (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={showcaseIndex === index}
                className={showcaseIndex === index ? 'is-active' : undefined}
                onClick={() => setShowcaseIndex(index)}
              >
                <small>{scenario.number}</small>
                <strong>{scenario.label}</strong>
                <span aria-hidden="true">{showcaseIndex === index ? '●' : '○'}</span>
              </button>
            ))}
          </div>

          <div id="product-showcase-panel" className="product-showcase-panel">
            <div className="product-showcase-question">
              <small>ILLUSTRATIVE OUTPUT / SHARED INPUT / {showcase.label}</small>
              <h3>{showcase.question}</h3>
              <span>BOTH ENGINES RUN INDEPENDENTLY →</span>
            </div>

            <div className="product-engine-grid">
              <article className="product-engine product-engine--arena">
                <header>
                  <div><small>ENGINE 01</small><h3>ARENA / DECISION ROOM</h3></div>
                  <span>4 RESPONSES · 1 JUDGE</span>
                </header>
                <div className="product-arena-answers">
                  {showcase.answers.map((answer, index) => (
                    <div key={answer.mind} style={{ '--tone': answer.tone } as CSSProperties}>
                      <small>0{index + 1}</small>
                      <strong>{answer.mind}</strong>
                      <p>{answer.copy}</p>
                      <b>{answer.score}</b>
                    </div>
                  ))}
                </div>
                <div className="product-verdict">
                  <div><small>JUDGE 05 / WINNER</small><strong>{showcase.winner}</strong></div>
                  <b>{Math.max(...showcase.answers.map((answer) => answer.score))}</b>
                  <p>{showcase.verdict}</p>
                </div>
                <footer>
                  <span>DEBATE ANY CLAIM · FOCUS ANY MIND</span>
                  <button type="button" onClick={() => go('/app')}>OPEN ARENA <ArrowRight aria-hidden="true" /></button>
                </footer>
              </article>

              <article className="product-engine product-engine--agent">
                <header>
                  <div><small>ENGINE 02</small><h3>AGENT / RESEARCH SYSTEM</h3></div>
                  <span>7 VISIBLE STAGES · ILLUSTRATIVE</span>
                </header>
                <div className="product-agent-stages" aria-label="Agent pipeline stages">
                  {AGENT_STAGES.map((stage, index) => <span key={stage}><small>0{index + 1}</small>{stage}</span>)}
                </div>
                <div className="product-agent-artifact">
                  <div><small>ILLUSTRATIVE DELIVERABLE</small><h4>{showcase.artifact}</h4></div>
                  <strong>{showcase.confidence}<small>ILLUSTRATIVE CONFIDENCE</small></strong>
                </div>
                <ul className="product-agent-evidence">
                  {showcase.evidence.map((item, index) => <li key={item}><span>0{index + 1}</span>{item}<b>EXAMPLE</b></li>)}
                </ul>
                <blockquote>“{showcase.verdict}”</blockquote>
                <footer>
                  <span>SOURCES · ASSUMPTIONS · CONFIDENCE</span>
                  <button type="button" onClick={() => go('/agent')}>RUN AGENT <ArrowRight aria-hidden="true" /></button>
                </footer>
              </article>
            </div>
          </div>
        </section>

        <section className="product-routing" aria-labelledby="product-routing-title">
          <header className="product-section-head">
            <div><h2 id="product-routing-title">Choose by the work—not the hype.</h2></div>
          </header>
          <div className="product-routing-table">
            <div className="product-routing-table__head"><span>SIGNAL</span><span>ROUTE</span><span>WHAT COMES BACK</span><span>ACTION</span></div>
            {ROUTING_ROWS.map((row, index) => (
              <div key={row.signal} className="product-routing-row" style={{ '--tone': row.tone } as CSSProperties}>
                <p><small>0{index + 1}</small>{row.signal}</p>
                <strong>{row.mode}</strong>
                <span>{row.output}</span>
                <button type="button" onClick={() => go(row.path)}>RUN <ArrowRight aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="product-surface" aria-labelledby="product-surface-title">
          <header className="product-section-head">
            <div><h2 id="product-surface-title">The verdict is only the beginning.</h2></div>
          </header>
          <div className="product-surface-grid">
            {PRODUCT_SURFACES.map((surface) => (
              <article key={surface.number} style={{ '--tone': surface.tone } as CSSProperties}>
                <small>{surface.number}</small><i aria-hidden="true" />
                <h3>{surface.title}</h3><p>{surface.body}</p>
              </article>
            ))}
          </div>
          <div className="product-surface__actions">
            <p><strong>16</strong> minds · <strong>04</strong> in every room · <strong>01</strong> visible verdict</p>
            <button type="button" onClick={() => navigate('/capabilities')}>EXPLORE EVERY CAPABILITY <ArrowRight aria-hidden="true" /></button>
          </div>
        </section>

        <section className="product-compare" aria-labelledby="product-compare-heading">
          <h2 id="product-compare-heading" className="product-compare__heading">Choose the engine. Keep the account.</h2>
          <div className="product-compare__pills">
            <span className="product-compare__pill">Arena → opinions, decisions, debate</span>
            <span className="product-compare__pill product-compare__pill--agent">Agent → research, briefs, complex tasks</span>
          </div>
          <div className="mkt-cta-row">
            <MotionButton type="button" variant="secondary" size="md" onClick={() => navigate('/capabilities')}>
              See all capabilities
            </MotionButton>
            <button type="button" className="arena-btn arena-btn--ghost arena-btn--md" onClick={() => navigate('/pricing')}>
              Pricing
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
