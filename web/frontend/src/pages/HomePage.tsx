import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';
import { prefersReducedMotion, scrollBehavior } from '../lib/motion';
import { API_ORIGIN } from '../api';
import { interpretHealthPayload, type SystemStatus } from '../lib/healthStatus';
import '../styles/landing.css';

/* ============================================================================
   Arena Landing — React implementation of the "Multi-Agent Distributed Logic
   Engine" template. Self-contained: own fixed header + dark footer, scoped
   styles in styles/landing.css, GSAP-free scroll reveals, and a token-streaming
   hero simulation with persona-true voices from the default Arena panel.
   ========================================================================== */

/* ------------------------------------------------------------------ data */

type SimAgent = 'contrarian' | 'analyst' | 'pragmatist' | 'philosopher';

const SIM_AGENTS: ReadonlyArray<{ id: SimAgent; name: string; tag: string; color: string }> = [
  { id: 'contrarian', name: 'Contrarian', tag: 'Grok · t1.0', color: 'var(--al-agent-contrarian)' },
  { id: 'analyst', name: 'Analyst', tag: 'DeepSeek · t0.2', color: 'var(--al-agent-analyst)' },
  { id: 'pragmatist', name: 'Pragmatist', tag: 'GPT-4o mini · t0.5', color: 'var(--al-agent-pragmatist)' },
  { id: 'philosopher', name: 'Philosopher', tag: 'GPT-4o · t0.7', color: 'var(--al-agent-philosopher)' },
];


const SIM_EMPTY: Record<SimAgent, string> = {
  contrarian: '',
  analyst: '',
  pragmatist: '',
  philosopher: '',
};

const SIM_CYCLES: ReadonlyArray<{ prompt: string; responses: Record<SimAgent, string> }> = [
  {
    prompt: 'Will artificial intelligence completely replace human jobs\nin the next five years?',
    responses: {
      contrarian:
        'No. The current hype will hit a structural wall — power grids, data ceilings, regulation. True human-curated original work will command a historic premium.',
      analyst:
        'Historically, automation displaces specific tasks and creates new categories. The data does not support mass permanent unemployment — but this transition is measurably faster than any precedent.',
      pragmatist:
        'It will automate predictable tasks while creating oversight roles. The challenge is not unemployment — it is the operational friction of upskilling millions of workers in time.',
      philosopher:
        'The question assumes jobs are natural phenomena rather than social constructs we invented — and can reinvent. Ask not what is replaced, but what we choose to value.',
    },
  },
  {
    prompt: 'Is working remotely genuinely better than working\nfrom a traditional corporate office?',
    responses: {
      contrarian:
        'Both systems are deeply flawed paradigms. Distributed setups silently fracture culture and innovation, while rigid offices systematically waste human energy.',
      analyst:
        'The evidence splits by function: deep-focus work gains measurably, collaborative ambiguity resolution degrades. Aggregate productivity claims in both directions outrun the data.',
      pragmatist:
        'Performance varies by discipline. Remote eliminates lease overhead but multiplies documentation demands. In practice, disciplined hybrid models win.',
      philosopher:
        'A false binary. The real question is what work is for — and whether presence should be measured by hours seen or by value created.',
    },
  },
  {
    prompt: 'Should social media platforms be strictly regulated by\ngovernments to protect mental health?',
    responses: {
      contrarian:
        'Heavy-handed legislation destroys digital sovereignty and algorithmic liberty. Mental health resolution stems from personal cognitive boundaries, not state-mandated firewalls.',
      analyst:
        'The correlation between usage and harm is real but modest; causation remains contested. Regulating on contested evidence invites measurable overreach.',
      pragmatist:
        'Equilibrium requires co-regulation: mandatory screen-time metrics and algorithm audit logs create a realistic baseline without killing platform utility.',
      philosopher:
        'Who bears the cost of attention harvested from the young? Naming that changes the question from “should we regulate” to “why did we wait”.',
    },
  },
  {
    prompt: 'Is pursuing a traditional college degree still worth it\nin the current digital economy?',
    responses: {
      contrarian:
        'The legacy university system operates as an obsolete credential cartel. Self-directed networks render outdated curricula irrelevant for true high-tier producers.',
      analyst:
        'ROI varies by an order of magnitude across fields. Median debt-to-earnings ratios condemn some degrees and vindicate others — aggregates lie.',
      pragmatist:
        'Medicine and engineering require physical validation loops. For technology and media, portfolio proof-of-work now eclipses paper credentials.',
      philosopher:
        'Education was never only vocational. The harder question: which parts of a mind do you outsource when you skip the slow years?',
    },
  },
  {
    prompt: 'Should city design prioritize public mass transit\nover private electric vehicles?',
    responses: {
      contrarian:
        'Forcing compliance via centralized rail planning ignores human geographic agency. Decentralized autonomous micro-mobility lanes offer a far more flexible network.',
      analyst:
        'Throughput math is unforgiving: one bus lane moves five times the people per hour of a car lane, electric or not. Geometry outranks drivetrain.',
      pragmatist:
        'Dense centers collapse under individual vehicle space requirements. Allocate lanes for high-efficiency transit; save outer grid links for EVs.',
      philosopher:
        'Cities are arguments about how we should live together. Prioritize the machine and you get isolation; prioritize the commons and you get a public.',
    },
  },
];

const MODES = [
  {
    num: 'M-01',
    title: 'Debate Mode',
    body: 'Force competing reasoning personas to cross-examine each other’s answers across multiple turns, surfacing hidden premise gaps no single model would find.',
    points: ['Adversarial token-level testing', 'Automated logic verification passes', 'Multi-turn systemic alignment audits'],
  },
  {
    num: 'M-02',
    title: 'Focus Mode',
    body: 'Isolate one persona in a private 1-on-1 follow-up thread — a dedicated lane optimized for deep context and zero competing noise.',
    points: ['Zero cognitive output variance', 'Dedicated high-context token lane', 'Direct follow-ups on any answer'],
  },
  {
    num: 'M-03',
    title: 'Agent Mode',
    body: 'Trigger a resilient 8-stage distributed research pipeline that converts a broad question into a verified, judged, production-grade brief.',
    points: ['Autonomous objective parsing', 'Continuous state pipeline synthesis', 'Self-correcting refinement loops'],
  },
] as const;

const PIPELINE_STAGES = [
  { num: '01', name: 'Planner', body: 'Deconstructs the prompt into isolated architectural task limits.' },
  { num: '02', name: 'Researcher', body: 'Gathers and cross-checks core verified parameters from the field.' },
  { num: '03', name: 'Steelman', body: 'Builds the strongest opposing case before any answer is drafted.' },
  { num: '04', name: 'Solver', body: 'Executes multi-provider generation concurrently across lanes.' },
  { num: '05', name: 'Critic', body: 'Attacks the draft for logical gaps, weak evidence, and drift.' },
  { num: '06', name: 'Verifier', body: 'Validates claims against sources before they can ship.' },
  { num: '07', name: 'Synthesizer', body: 'Combines heterogeneous token tracks into one coherent brief.' },
  { num: '08', name: 'Judge', body: 'Scores the output across four objective structural vectors.' },
] as const;

const ENGINE_STATS = [
  { title: 'Python / FastAPI', body: 'Non-blocking asynchronous multi-provider data pools.' },
  { title: 'SQLAlchemy 2', body: 'Structural session tracking preserved flawlessly.' },
  { title: 'React 18 / TS', body: 'Atomic token rendering without main-thread blocking.' },
  { title: 'Razorpay Ledger', body: 'Secure subscription billing and compute accounting.' },
] as const;

const TIERS = [
  {
    name: 'Free Core',
    tagline: 'For diagnostic structural evaluations.',
    price: '₹0',
    period: '/ forever',
    features: ['5 messages per day · 25k tokens', '6 starter personas on the panel', 'Standard parallel arena tracks', 'No credit card required'],
    cta: 'Create Free Account',
    featured: false,
    action: 'signin' as const,
  },
  {
    name: 'Arena Plus',
    tagline: 'For full-stack logic orchestration paths.',
    price: '₹999',
    period: '/ month',
    features: [
      '15 messages per day · 100k tokens',
      'All 16 reasoning personas unlocked',
      'Debate Mode + Focus Mode lanes',
      'Memory, saved responses & rooms',
    ],
    cta: 'Upgrade to Plus',
    featured: true,
    action: 'pricing' as const,
  },
  {
    name: 'Arena Pro',
    tagline: 'For automated industrial research processes.',
    price: '₹2,499',
    period: '/ month',
    features: [
      '35+ messages per day · 300k tokens',
      'Full 8-stage Agent Mode pipeline',
      'Orchestration, watchlist & scoring audit',
      'Calibration and refinement iterations',
    ],
    cta: 'Get Pro',
    featured: false,
    action: 'pricing' as const,
  },
] as const;

const FAQ_ITEMS = [
  {
    q: 'How does Arena keep four agent streams aligned?',
    a: 'The FastAPI orchestrator fans your prompt out to four providers over non-blocking server-sent event channels. As tokens arrive, the React scheduler renders each persona into its own isolated lane — so every stream stays live, ordered, and independently readable.',
  },
  {
    q: 'What exactly does the Judge score?',
    a: 'A fifth, independent model evaluates every answer across four objective vectors: context relevance, logical insight, syntactic clarity, and intellectual honesty. The winner is surfaced with its score — never silently.',
  },
  {
    q: 'Can I choose which four minds answer?',
    a: 'Yes. The panel is fully editable — pick any 4 of 16 personas, from the cold Analyst to the Contrarian running at temperature 1.0. Different problems call for different thinkers.',
  },
  {
    q: 'Is my prompt data kept confidential?',
    a: 'Your sessions live only in your private account history. Prompts are forwarded to model providers over their commercial APIs and are never used to train Arena models or shared across accounts.',
  },
] as const;

/* --------------------------------------------------------------- helpers */

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

function useInView<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** One observer upgrades every `.al-reveal`/`.al-reveal-group` in the tree. */
function useScrollReveals(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll('.al-reveal, .al-reveal-group');
    if (prefersReducedMotion()) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

/* ---------------------------------------------------------------- header */

function LandingHeader({
  onLaunch,
  onSignIn,
}: {
  onLaunch: () => void;
  onSignIn: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastYRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 12);
        setHidden(y > 420 && y > lastYRef.current && !menuOpen);
        lastYRef.current = y;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? Math.min(y / max, 1) : 0;
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${progress})`;
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [menuOpen]);

  const scrollTo = useCallback((id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, []);

  const links: ReadonlyArray<{ label: string; target: string }> = [
    { label: 'Capabilities', target: 'capabilities' },
    { label: 'Matrix', target: 'pipeline' },
    { label: 'Architecture', target: 'engine' },
    { label: 'Scale', target: 'pricing' },
  ];

  const shell = `al-header${scrolled ? ' al-header--scrolled' : ''}${hidden ? ' al-header--hidden' : ''}`;

  return (
    <header className={shell}>
      <div className="al-progress" ref={progressRef} aria-hidden="true" />
      <div className="al-container al-nav">
        <button
          type="button"
          className="al-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
          aria-label="Arena — back to top"
        >
          ARENA<span>.</span>
        </button>

        <nav aria-label="Primary">
          <ul className="al-nav-list">
            {links.map((link) => (
              <li key={link.target}>
                <button type="button" className="al-nav-link" onClick={() => scrollTo(link.target)}>
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="al-nav-right">
          <button type="button" className="al-nav-link al-nav-signin" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" className="al-btn al-btn--brand al-btn--sm" onClick={onLaunch}>
            Sign up
          </button>
          <button
            type="button"
            className="al-menu-btn"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i /> <i /> <i />
          </button>
        </div>
      </div>

      <div className={`al-mobile-panel${menuOpen ? ' open' : ''}`}>
        {links.map((link) => (
          <button
            key={link.target}
            type="button"
            className="al-nav-link"
            onClick={() => scrollTo(link.target)}
          >
            {link.label}
          </button>
        ))}
        <button
          type="button"
          className="al-btn al-btn--outline al-btn--block"
          style={{ marginTop: 14 }}
          onClick={() => {
            setMenuOpen(false);
            onSignIn();
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className="al-btn al-btn--brand al-btn--block"
          style={{ marginTop: 8 }}
          onClick={() => {
            setMenuOpen(false);
            onLaunch();
          }}
        >
          Sign up free
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------- hero visualizer */

function HeroVisualizer() {
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.08);
  const pageVisible = usePageVisible();
  const reduced = useRef(prefersReducedMotion()).current;
  const cycleRef = useRef(0);
  const [kick, setKick] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [streams, setStreams] = useState<Record<SimAgent, string>>(SIM_EMPTY);
  const [phase, setPhase] = useState<'typing' | 'streaming' | 'holding'>('holding');

  useEffect(() => {
    const matrix = SIM_CYCLES[cycleRef.current];

    /* Static render path — reduced motion, tab hidden, or window offscreen. */
    if (reduced || !inView || !pageVisible) {
      setPrompt(matrix.prompt);
      setStreams({ ...matrix.responses });
      setPhase('holding');
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, ms);
        timers.push(id);
      });

    const run = async () => {
      while (!cancelled) {
        const current = SIM_CYCLES[cycleRef.current];
        setStreams({ ...SIM_EMPTY });
        setPrompt('');
        setPhase('typing');

        await wait(600);
        for (let i = 1; i <= current.prompt.length; i += 1) {
          if (cancelled) return;
          setPrompt(current.prompt.slice(0, i));
          await wait(13);
        }

        await wait(420);
        if (cancelled) return;
        setPhase('streaming');

        await Promise.all(
          SIM_AGENTS.map(async (agent, idx) => {
            await wait(240 + idx * 280);
            const text = current.responses[agent.id];
            for (let c = 0; c < text.length; c += 3) {
              if (cancelled) return;
              const chunk = text.slice(c, c + 3);
              setStreams((prev) => ({ ...prev, [agent.id]: prev[agent.id] + chunk }));
              await wait(13 + Math.random() * 14);
            }
          }),
        );

        if (cancelled) return;
        setPhase('holding');
        await wait(6500);
        if (cancelled) return;
        cycleRef.current = (cycleRef.current + 1) % SIM_CYCLES.length;
      }
    };

    void run();
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [reduced, inView, pageVisible, kick]);

  const skipToNext = useCallback(() => {
    cycleRef.current = (cycleRef.current + 1) % SIM_CYCLES.length;
    setKick((k) => k + 1);
  }, []);

  const activeMatrix = SIM_CYCLES[cycleRef.current];

  return (
    <div className="al-window" ref={viewRef} role="img" aria-label="Simulated Arena session: four AI personas stream answers to one prompt in parallel.">
      <div className="al-window-bar">
        <div className="al-window-dots" aria-hidden="true">
          <i style={{ background: '#ff5f56' }} />
          <i style={{ background: '#ffbd2e' }} />
          <i style={{ background: '#27c93f' }} />
        </div>
        <div className="al-window-label">
          <i aria-hidden="true" />
          ARENA MODE · LIVE SIMULATION
        </div>
      </div>

      <div className="al-agents-grid">
        {SIM_AGENTS.map((agent) => {
          const text = streams[agent.id];
          const full = activeMatrix.responses[agent.id];
          const streaming = phase === 'streaming' && text.length < full.length;
          return (
            <div key={agent.id} className={`al-agent-card${phase === 'streaming' ? ' is-active' : ''}`}>
              <div className="al-agent-head">
                <div className="al-agent-name">
                  <span className="al-agent-dot" style={{ background: agent.color }} aria-hidden="true" />
                  {agent.name}
                </div>
                <span className="al-agent-tag">{agent.tag}</span>
              </div>
              <div className={`al-agent-stream${streaming ? ' is-streaming' : ''}`} aria-hidden="true">
                {text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="al-prompt-bar">
        <div className="al-prompt-field">
          <div className={`al-prompt-text${phase === 'typing' ? ' is-typing' : ''}`} aria-hidden="true">
            {prompt}
          </div>
        </div>
        <button
          type="button"
          className="al-execute"
          onClick={skipToNext}
          title="Skip to the next simulated prompt"
        >
          EXECUTE
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- footer */

function LandingFooter() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    const probe = () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 4000);
      void fetch(`${API_ORIGIN}/api/health`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error('health failed');
          const data = (await r.json()) as { status?: string; database?: string };
          if (!cancelled) setStatus(interpretHealthPayload(data));
        })
        .catch(() => {
          if (!cancelled) setStatus('unreachable');
        })
        .finally(() => window.clearTimeout(timer));
    };

    probe();
    if (!prefersReducedMotion()) {
      intervalId = window.setInterval(probe, 45_000);
    }
    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  const statusLabel =
    status === 'operational'
      ? 'All systems operational'
      : status === 'degraded'
        ? 'Systems degraded'
        : status === 'unreachable'
          ? 'Status unavailable'
          : 'Checking status…';
  const statusColor =
    status === 'operational' ? '#34d399' : status === 'degraded' ? '#fbbf24' : '#64748b';

  const go = (path: string) => () => navigate(path);

  return (
    <footer className="al-footer">
      <div className="al-container al-footer-grid">
        <div className="al-footer-brand">
          <span className="al-logo" aria-hidden="true">
            ARENA<span>.</span>
          </span>
          <p>
            An enterprise-grade ecosystem built to evaluate, challenge, and synthesize complex
            multi-model reasoning structures in parallel.
          </p>
        </div>

        <div className="al-footer-col">
          <h5>Platform</h5>
          <ul>
            <li><button type="button" className="al-footer-link" onClick={go('/product')}>Product Overview</button></li>
            <li><button type="button" className="al-footer-link" onClick={go('/capabilities')}>Capabilities</button></li>
            <li><button type="button" className="al-footer-link" onClick={go('/personas')}>Persona Library</button></li>
            <li><button type="button" className="al-footer-link" onClick={go('/pricing')}>Pricing &amp; Scale</button></li>
            <li><button type="button" className="al-footer-link" onClick={go('/changelog')}>Changelog</button></li>
          </ul>
        </div>

        <div className="al-footer-col">
          <h5>Company</h5>
          <ul>
            <li><button type="button" className="al-footer-link" onClick={go('/about')}>About</button></li>
            <li><button type="button" className="al-footer-link" onClick={go('/terms')}>Terms of Service</button></li>
            <li><button type="button" className="al-footer-link" onClick={go('/privacy')}>Privacy Policy</button></li>
          </ul>
        </div>
      </div>

      <div className="al-container al-footer-base">
        <span>© 2026 Arena Logic Systems. All rights reserved.</span>
        <span className="al-footer-status" role="status" aria-live="polite">
          <i style={{ background: statusColor }} aria-hidden="true" />
          {statusLabel}
        </span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page */

export function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number>(0);

  useScrollReveals(rootRef);

  const launch = useCallback(
    (path: string = '/app', mode: 'signup' | 'signin' = 'signup') => {
      if (isAuthenticated) {
        navigate(path);
        return;
      }
      setRedirectIntent(path);
      navigate(mode === 'signup' ? '/signin?tab=signup' : '/signin?tab=signin');
    },
    [isAuthenticated, navigate],
  );

  return (
    <div className="arena-landing" ref={rootRef}>
      <LandingHeader
        onLaunch={() => launch('/app', 'signup')}
        onSignIn={() => launch('/app', 'signin')}
      />

      <main>
        {/* ---------------------------------------------------------- hero */}
        <section className="al-hero" aria-labelledby="al-hero-title">
          <div className="al-container al-hero-grid">
            <div className="al-reveal">
              <div className="al-hero-badge">
                <i aria-hidden="true" />
                Now live · Free to try
              </div>
              <h1 className="al-hero-title" id="al-hero-title">
                Concurrently Stream.
                <br />
                <span className="al-accent">Adversarially</span> Judge.
              </h1>
              <p className="al-hero-sub">
                Route one prompt across four distinct reasoning personas in parallel — streamed
                token-by-token. A fifth independent judge scores every answer on relevance,
                insight, clarity, and honesty. The best answer wins.
              </p>
              <div className="al-hero-ctas">
                <button type="button" className="al-btn al-btn--brand" onClick={() => launch('/app', 'signup')}>
                  Sign up free <span className="al-btn__arrow" aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  className="al-btn al-btn--outline"
                  onClick={() => navigate('/capabilities')}
                >
                  See capabilities
                </button>
              </div>
              <div className="al-hero-proof">
                <span><b>4</b> personas in parallel</span>
                <span><b>5th</b> judge scores</span>
                <span>No card to start</span>
              </div>
            </div>

            <div className="al-reveal">
              <HeroVisualizer />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- capabilities */}
        <section id="capabilities" className="al-section" aria-labelledby="al-cap-title">
          <span id="how-it-works" style={{ position: 'absolute', top: -80 }} aria-hidden="true" />
          <div className="al-container">
            <div className="al-section-head al-reveal">
              <div>
                <span className="al-eyebrow">Execution Topologies</span>
                <h2 id="al-cap-title">Three Execution Topologies.</h2>
              </div>
              <p>
                Isolate dedicated computation threads, force intensive multi-turn adversarial
                verification passes, or configure deep continuous autonomous pipelines seamlessly.
              </p>
            </div>

            <div className="al-cards-grid al-reveal-group">
              {MODES.map((mode) => (
                <article key={mode.num} className="al-feature-card">
                  <h3>
                    <span className="al-feature-num">{mode.num}</span>
                    {mode.title}
                  </h3>
                  <p>{mode.body}</p>
                  <ul className="al-feature-list">
                    {mode.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- pipeline */}
        <section id="pipeline" className="al-section al-section--tint" aria-labelledby="al-pipe-title">
          <div className="al-container">
            <div className="al-section-head al-reveal">
              <div>
                <span className="al-eyebrow">Agent Mode Internals</span>
                <h2 id="al-pipe-title">The 8-Stage Research Matrix</h2>
              </div>
              <p>
                Inside Agent Mode, a single question triggers an advanced processing pipeline
                designed to systematically evaluate, verify, and deliver bulletproof answers.
              </p>
            </div>

            <div className="al-pipeline-grid al-reveal-group">
              {PIPELINE_STAGES.map((stage) => (
                <article key={stage.num} className="al-pipeline-card">
                  <div className="al-pipeline-num">{stage.num}</div>
                  <h4>{stage.name}</h4>
                  <p>{stage.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- engine */}
        <section id="engine" className="al-section" aria-labelledby="al-engine-title">
          <div className="al-container al-engine-grid">
            <div className="al-reveal">
              <span className="al-eyebrow">Industrial Specification</span>
              <h2 id="al-engine-title">Engineered For Low-Latency Concurrency.</h2>
              <p>
                Arena couples a non-blocking asynchronous backend with concurrent frontend
                rendering to keep four execution lanes streaming cleanly at once.
              </p>
              <div className="al-stat-grid">
                {ENGINE_STATS.map((stat) => (
                  <div key={stat.title} className="al-stat">
                    <h4>{stat.title}</h4>
                    <p>{stat.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="al-reveal">
              <div className="al-code-window" aria-label="Simplified FastAPI orchestration code">
                <span className="al-code-k">async def</span>{' '}
                <span className="al-code-f">dispatch_parallel_compute</span>(ctx: PromptMap):{'\n'}
                {'    '}agents = [contrarian, analyst, pragmatist, philosopher]{'\n'}
                {'    '}<span className="al-code-c"># Fire high-throughput async provider streams</span>{'\n'}
                {'    '}worker_streams = [node.stream(ctx.text){' '}
                <span className="al-code-k">for</span> node <span className="al-code-k">in</span> agents]{'\n'}
                {'    '}token_buffers = <span className="al-code-k">await</span> asyncio.gather(*worker_streams){'\n'}
                {'\n'}
                {'    '}<span className="al-code-c"># Delegate synthesis to the independent Judge node</span>{'\n'}
                {'    '}<span className="al-code-k">return await</span>{' '}
                <span className="al-code-s">judicial_engine</span>.evaluate(token_buffers)
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- pricing */}
        <section id="pricing" className="al-section al-section--tint" aria-labelledby="al-pricing-title">
          <div className="al-container">
            <div className="al-pricing-head al-reveal">
              <span className="al-eyebrow" style={{ justifyContent: 'center' }}>Secure Billing</span>
              <h2 id="al-pricing-title">Predictable Billing. Maximum Inference Compute.</h2>
              <p>
                Provision compute dynamically, backed by secure Razorpay subscription pipelines.
                Upgrade, downgrade, or cancel anytime.
              </p>
            </div>

            <div className="al-pricing-grid al-reveal-group">
              {TIERS.map((tier) => (
                <article
                  key={tier.name}
                  className={`al-price-card${tier.featured ? ' al-price-card--featured' : ''}`}
                >
                  <h3>{tier.name}</h3>
                  <p>{tier.tagline}</p>
                  <div className="al-price-value">
                    {tier.price}
                    <span>{tier.period}</span>
                  </div>
                  <ul className="al-price-features">
                    {tier.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`al-btn ${tier.featured ? 'al-btn--brand' : 'al-btn--outline'} al-btn--block`}
                    onClick={() =>
                      tier.action === 'signin' ? launch('/app', 'signup') : navigate('/pricing')
                    }
                  >
                    {tier.cta}
                  </button>
                </article>
              ))}
            </div>

            <p className="al-pricing-note al-reveal">
              Agent Mode add-on available for Plus at ₹599/mo · Yearly billing saves up to 33%
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ faq */}
        <section id="faq" className="al-section" aria-labelledby="al-faq-title">
          <div className="al-container al-faq-grid">
            <div className="al-reveal">
              <span className="al-eyebrow">System Manifest</span>
              <h2 id="al-faq-title">Frequently Documented Operations.</h2>
              <p>
                Technical reference notes covering stream orchestration, scoring methodology,
                panel configuration, and data handling.
              </p>
            </div>

            <div className="al-accordion al-reveal">
              {FAQ_ITEMS.map((item, idx) => {
                const open = openFaq === idx;
                return (
                  <div key={item.q} className={`al-acc-item${open ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="al-acc-trigger"
                      aria-expanded={open}
                      aria-controls={`al-acc-panel-${idx}`}
                      onClick={() => setOpenFaq(open ? -1 : idx)}
                    >
                      <h3>{item.q}</h3>
                      <span className="al-acc-icon" aria-hidden="true">+</span>
                    </button>
                    <div className="al-acc-panel" id={`al-acc-panel-${idx}`} role="region" aria-hidden={!open}>
                      <div className="al-acc-panel-inner">
                        <p>{item.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ cta band */}
        <section className="al-section al-section--tint" aria-labelledby="al-cta-title" style={{ borderBottom: 'none' }}>
          <div className="al-container al-pricing-head al-reveal" style={{ marginBottom: 0 }}>
            <span className="al-eyebrow" style={{ justifyContent: 'center' }}>Get started</span>
            <h2 id="al-cta-title">Stop asking one AI. Start asking four.</h2>
            <p style={{ marginBottom: 32 }}>
              Free tier included. Your first arena run takes under thirty seconds.
            </p>
            <div className="al-hero-ctas" style={{ justifyContent: 'center', marginBottom: 0 }}>
              <button type="button" className="al-btn al-btn--brand" onClick={() => launch('/app', 'signup')}>
                Create free account <span className="al-btn__arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" className="al-btn al-btn--outline" onClick={() => navigate('/pricing')}>
                View pricing
              </button>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
