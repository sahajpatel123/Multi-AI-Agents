import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { copyToClipboard } from '../lib/clipboard';
import '../styles/verdict-docs.css';

type ChapterId = 'start' | 'concepts' | 'agent' | 'api' | 'architecture' | 'tiers' | 'security';
type CopyState = { id: string; status: 'copied' | 'failed' } | null;

const CHAPTERS: readonly {
  id: ChapterId;
  index: string;
  label: string;
}[] = [
  { id: 'start', index: '01', label: 'Start here' },
  { id: 'concepts', index: '02', label: 'Runtime model' },
  { id: 'agent', index: '03', label: 'Agent Mode' },
  { id: 'api', index: '04', label: 'API surface' },
  { id: 'architecture', index: '05', label: 'Architecture' },
  { id: 'tiers', index: '06', label: 'Plans & limits' },
  { id: 'security', index: '07', label: 'Security' },
] as const;

const BACKEND_SETUP = `cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python main.py`;

const FRONTEND_SETUP = `cd web/frontend
npm install
npm run dev`;

const PROJECT_MAP = `backend/arena/core/    orchestration · scoring · memory · tools
backend/arena/routes/  FastAPI feature routers
backend/alembic/       additive schema migrations
web/frontend/src/      React pages · components · contexts
web/frontend/src/api.ts typed backend client`;

const PIPELINE = [
  { id: 'plan', index: '01', label: 'Plan', output: 'Task graph', description: 'Decomposes the question into explicit research and reasoning tasks.', tone: '#5ED8FF' },
  { id: 'research', index: '02', label: 'Research', output: 'Evidence set', description: 'Collects context and evidence for the planned work.', tone: '#A98CF8' },
  { id: 'solve', index: '03', label: 'Solve', output: 'Candidate answer', description: 'Builds the first supported answer from the available evidence.', tone: '#D7F64A' },
  { id: 'critique', index: '04', label: 'Critique', output: 'Failure report', description: 'Attacks weak reasoning, unsupported claims, and missing perspectives.', tone: '#FF6652' },
  { id: 'verify', index: '05', label: 'Verify', output: 'Verification context', description: 'Checks consequential claims and records what can or cannot be established.', tone: '#5ED8FF' },
  { id: 'synthesize', index: '06', label: 'Synthesize', output: 'Structured brief', description: 'Combines the strongest supported material without erasing dissent.', tone: '#A98CF8' },
  { id: 'judge', index: '07', label: 'Judge', output: 'Ready / revise', description: 'Evaluates the result and can request a bounded refinement pass.', tone: '#F0B84E' },
] as const;

const API_GROUPS = [
  {
    id: 'auth', index: '01', label: 'Identity', note: 'Registration, token lifecycle, and account identity.',
    routes: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/refresh', 'POST /api/auth/logout', 'GET  /api/auth/me'],
  },
  {
    id: 'arena', index: '02', label: 'Arena', note: 'Parallel panel runs and focused follow-through.',
    routes: ['POST /api/prompt', 'POST /api/prompt/stream', 'POST /api/debate/stream', 'POST /api/discuss/stream', 'GET  /api/session/:id'],
  },
  {
    id: 'agent', index: '03', label: 'Agent', note: 'Long-form research tasks, status, refinement, and history.',
    routes: ['POST /api/agent/run', 'POST /api/agent/orchestrate', 'POST /api/agent/refine', 'GET  /api/agent/status/:id', 'GET  /api/agent/result/:id'],
  },
  {
    id: 'workspace', index: '04', label: 'Workspace', note: 'Panels, personas, saved work, rooms, and recurring research.',
    routes: ['GET  /api/personas', 'POST /api/panel/save', 'POST /api/memory/save', 'POST /api/agent/watchlist', 'POST /api/rooms/create'],
  },
  {
    id: 'billing', index: '05', label: 'Billing', note: 'Razorpay subscriptions, add-ons, and a signed webhook lifecycle.',
    routes: ['POST /api/payments/subscribe', 'POST /api/payments/verify', 'POST /api/payments/cancel', 'POST /api/payments/webhook', 'POST /api/payments/addon/agent/subscribe', 'GET  /api/payments/subscription'],
  },
] as const;

const SECURITY_CONTROLS = [
  ['01', 'REQUEST EDGE', '10 KB default request limit; 10 MB only for upload routes.'],
  ['02', 'ORIGIN EDGE', 'Production CORS is allowlist-only; wildcard origins are rejected.'],
  ['03', 'IDENTITY EDGE', 'bcrypt 12-round password hashing with SHA-256 prehash and persisted token revocation.'],
  ['04', 'PAYMENT EDGE', 'Razorpay webhooks require HMAC-SHA256 verification.'],
  ['05', 'MODEL EDGE', 'Prompt-injection signatures and a rules-plus-model toxicity gate run before agents.'],
  ['06', 'SECRET EDGE', 'Production startup fails closed when critical secrets are missing or weak.'],
] as const;

const PLAN_ROWS = [
  ['Guest', '3', '25K', '6', '—'],
  ['Free', '5', '25K', '6', '—'],
  ['Plus', '15', '100K', '16', '₹599/mo add-on'],
  ['Pro', '35', '300K', '16', 'Included'],
] as const;

function CodeBlock({
  id,
  label,
  value,
  copyState,
  onCopy,
}: {
  id: string;
  label: string;
  value: string;
  copyState: CopyState;
  onCopy: (id: string, value: string) => void;
}) {
  const state = copyState?.id === id ? copyState.status : null;
  return (
    <div className="docs-code-block">
      <header>
        <span><Terminal aria-hidden="true" />{label}</span>
        <button
          type="button"
          onClick={() => onCopy(id, value)}
          aria-label={`${state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed for' : 'Copy'} ${label}`}
          className={state ? `is-${state}` : ''}
        >
          {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Retry' : 'Copy'}
        </button>
      </header>
      <pre><code>{value}</code></pre>
    </div>
  );
}

function ChapterHeading({ id, index, eyebrow, title, body }: { id: string; index: string; eyebrow: string; title: string; body: string }) {
  return (
    <header className="docs-chapter-heading">
      <span>{index} / {eyebrow}</span>
      <div><h2 id={id}>{title}</h2><p>{body}</p></div>
    </header>
  );
}

export function DocsPage() {
  const navigate = useNavigate();
  const [copyState, setCopyState] = useState<CopyState>(null);
  const [activeStageId, setActiveStageId] = useState<(typeof PIPELINE)[number]['id']>(PIPELINE[0].id);
  const [activeApiId, setActiveApiId] = useState<(typeof API_GROUPS)[number]['id']>(API_GROUPS[1].id);
  const [activeChapter, setActiveChapter] = useState<ChapterId>('start');
  const copyTimerRef = useRef<number | null>(null);
  const activeStage = PIPELINE.find((stage) => stage.id === activeStageId) ?? PIPELINE[0];
  const activeApi = API_GROUPS.find((group) => group.id === activeApiId) ?? API_GROUPS[1];

  useEffect(() => {
    const syncFromViewport = () => {
      let nextChapter: ChapterId = CHAPTERS[0].id;
      for (const chapter of CHAPTERS) {
        const section = document.getElementById(chapter.id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= 160) nextChapter = chapter.id;
        else break;
      }
      setActiveChapter(nextChapter);
    };
    const syncFromHash = () => {
      const hashId = window.location.hash.slice(1) as ChapterId;
      const hashChapter = CHAPTERS.find((chapter) => chapter.id === hashId);
      if (!hashChapter) return false;
      setActiveChapter(hashChapter.id);
      return true;
    };
    const onHashChange = () => {
      if (!syncFromHash()) syncFromViewport();
    };

    if (!syncFromHash()) syncFromViewport();
    window.addEventListener('scroll', syncFromViewport, { passive: true });
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('scroll', syncFromViewport);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const copy = async (id: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    setCopyState({ id, status: ok ? 'copied' : 'failed' });
    copyTimerRef.current = window.setTimeout(() => setCopyState(null), ok ? 1600 : 2600);
  };

  const jumpToChapter = (id: ChapterId) => {
    setActiveChapter(id);
  };

  return (
    <div className="docs-page docs-field-page">
      <Navbar />
      <main id="main-content" className="docs-main" tabIndex={-1} aria-labelledby="docs-title">
        <section className="docs-field-hero" aria-labelledby="docs-title">
          <div className="docs-field-hero__copy">
            <h1 id="docs-title">Understand the system. <em>Then change it.</em></h1>
            <p>Architecture, runtime behavior, public APIs, limits, and security boundaries—explained as one inspectable system.</p>
            <div className="docs-field-hero__actions">
              <a href="#start">Start locally <ArrowRight aria-hidden="true" /></a>
              <button type="button" onClick={() => navigate('/product')}>Product overview</button>
            </div>
            <dl className="docs-field-proof">
              <div><dt>07</dt><dd>field chapters</dd></div>
              <div><dt>07</dt><dd>visible Agent stages</dd></div>
              <div><dt>16</dt><dd>reasoning styles</dd></div>
            </dl>
          </div>
        </section>

        <div className="docs-field-layout">
          <aside className="docs-field-nav" aria-label="Documentation chapters">
            <header><span>On this page</span><b>{String(CHAPTERS.length).padStart(2, '0')}</b></header>
            <nav>
              {CHAPTERS.map((chapter) => (
                <a key={chapter.id} href={`#${chapter.id}`} className={activeChapter === chapter.id ? 'is-active' : ''} aria-current={activeChapter === chapter.id ? 'location' : undefined} onClick={() => jumpToChapter(chapter.id)}>
                  <small>{chapter.index}</small><span>{chapter.label}</span>
                </a>
              ))}
            </nav>
            <button type="button" onClick={() => navigate('/changelog')}>View changelog <ArrowRight aria-hidden="true" /></button>
          </aside>

          <div className="docs-field-reader">
            <section id="start" className="docs-field-chapter" aria-labelledby="docs-start-title">
              <ChapterHeading id="docs-start-title" index="01" eyebrow="Start here" title="From clone to first verdict." body="Bring up the API, apply migrations, start the client, and verify both surfaces before changing behavior." />
              <div className="docs-boot-sequence" aria-label="Local boot sequence">
                {[['01','ENV','Python 3.11+ · Node.js 18+'],['02','SECRETS','Anthropic key · strong SECRET_KEY'],['03','DATA','PostgreSQL primary · SQLite dev fallback'],['04','RUN','API :8000 · UI :5173']].map(([n,label,text]) => <article key={n}><small>{n}</small><strong>{label}</strong><p>{text}</p></article>)}
              </div>
              <div className="docs-code-grid">
                <CodeBlock id="backend" label="Backend / terminal 01" value={BACKEND_SETUP} copyState={copyState} onCopy={copy} />
                <CodeBlock id="frontend" label="Frontend / terminal 02" value={FRONTEND_SETUP} copyState={copyState} onCopy={copy} />
              </div>
              <div className="docs-field-note"><strong>Health sequence</strong><p>Run <code>alembic upgrade head</code>, then check <code>/api/health</code>. The browser reaches the API through <code>/api/*</code>; never hardcode a production backend URL.</p></div>
            </section>

            <section id="concepts" className="docs-field-chapter" aria-labelledby="docs-concepts-title">
              <ChapterHeading id="docs-concepts-title" index="02" eyebrow="Runtime model" title="One prompt. Five model roles. One verdict." body="Arena preserves disagreement: four configured personas answer independently, then a fifth model evaluates the resulting set." />
              <div className="docs-runtime-map">
                <div className="docs-runtime-map__input"><small>Input / 01</small><strong>Your question</strong><span>sanitize → classify → route</span></div>
                <div className="docs-runtime-map__fan" aria-label="Four parallel persona responses">
                  {['Analyst','Philosopher','Pragmatist','Contrarian'].map((name,index) => <article key={name} style={{ '--runtime-tone': ['#5ED8FF','#A98CF8','#D7F64A','#FF6652'][index] } as CSSProperties}><small>0{index + 1}</small><strong>{name}</strong><span>parallel SSE</span></article>)}
                </div>
                <div className="docs-runtime-map__judge"><small>Role / 05</small><strong>Independent scorer</strong><span>relevance · insight · clarity · intellectual honesty</span></div>
                <footer><span>Frontend transport</span><b>fetch + ReadableStream + AbortController</b></footer>
              </div>
              <div className="docs-score-ledger">
                {[['RELEVANCE','Does it answer the actual question?'],['INSIGHT','Does it reveal something non-obvious?'],['CLARITY','Can the reasoning be inspected?'],['HONESTY','Are limits and uncertainty named?']].map(([label,text],index) => <article key={label}><small>0{index + 1}</small><strong>{label}</strong><p>{text}</p></article>)}
              </div>
            </section>

            <section id="agent" className="docs-field-chapter" aria-labelledby="docs-agent-title">
              <ChapterHeading id="docs-agent-title" index="03" eyebrow="Agent Mode" title="A research pipeline that can reject its own work." body="Seven visible stages expose progress while the runtime carries structured artifacts forward and bounds refinement." />
              <div className="docs-pipeline-studio">
                <div className="docs-pipeline" role="group" aria-label="Inspect Agent stage">
                  {PIPELINE.map((stage) => (
                    <button key={stage.id} type="button" aria-label={`Stage ${stage.index}: ${stage.label}`} aria-pressed={activeStage.id === stage.id} className={activeStage.id === stage.id ? 'is-active' : ''} style={{ '--stage-tone': stage.tone } as CSSProperties} onClick={() => setActiveStageId(stage.id)}>
                      <small>{stage.index}</small><strong>{stage.label}</strong><span aria-hidden="true">{activeStage.id === stage.id ? '●' : '○'}</span>
                    </button>
                  ))}
                </div>
                <aside className="docs-stage-inspector" style={{ '--stage-tone': activeStage.tone } as CSSProperties} aria-live="polite" aria-label="Selected Agent stage">
                  <header><span>Selected stage</span><b>{activeStage.index} / 07</b></header>
                  <div><small>{activeStage.output}</small><h3>{activeStage.label}</h3><p>{activeStage.description}</p></div>
                  <footer>Judge may request revision; solver → synthesis → judgment is bounded to two refinement passes.</footer>
                </aside>
              </div>
              <div className="docs-field-note"><strong>Public progress contract</strong><p>The product says seven stages because those are the stages users see. Pipeline internals remain implementation detail; do not infer additional public steps from source layout.</p></div>
            </section>

            <section id="api" className="docs-field-chapter" aria-labelledby="docs-api-title">
              <ChapterHeading id="docs-api-title" index="04" eyebrow="API surface" title="Typed routes. Streaming where time matters." body="The frontend centralizes backend calls in a typed client. Streaming paths use fetch readers so navigation and Stop controls can abort work." />
              <div className="docs-api-explorer">
                <div className="docs-api-explorer__tabs" role="group" aria-label="API route group">
                  {API_GROUPS.map((group) => <button key={group.id} type="button" aria-label={`Show ${group.label} endpoints`} aria-pressed={activeApi.id === group.id} className={activeApi.id === group.id ? 'is-active' : ''} onClick={() => setActiveApiId(group.id)}><small>{group.index}</small><span>{group.label}</span></button>)}
                </div>
                <div className="docs-api-explorer__panel" aria-live="polite">
                  <header><span>{activeApi.label} routes</span><b>{String(activeApi.routes.length).padStart(2,'0')} endpoints</b></header>
                  <p>{activeApi.note}</p>
                  <pre>{activeApi.routes.map((route) => <code key={route}>{route}</code>)}</pre>
                  <footer><span>Base</span><b>/api/*</b><span>Client</span><b>src/api.ts</b></footer>
                </div>
              </div>
            </section>

            <section id="architecture" className="docs-field-chapter" aria-labelledby="docs-architecture-title">
              <ChapterHeading id="docs-architecture-title" index="05" eyebrow="Architecture" title="Boundaries that make disagreement operable." body="Client, service, intelligence, and persistence remain separable so routing, scoring, memory, and transport can evolve independently." />
              <div className="docs-architecture-map">
                {[['01','CLIENT','React 18 · TypeScript · Vite','Route-split pages, contexts, typed API calls, streaming UI.'],['02','SERVICE','FastAPI · SQLAlchemy · Alembic','Feature routers, middleware, schemas, additive migrations.'],['03','INTELLIGENCE','Anthropic · OpenAI · xAI · DeepSeek','Task-aware routes; missing optional provider keys fall back to Claude.'],['04','DATA & OPS','PostgreSQL · SQLite dev fallback','Persistent product data, JSON logs, latency and scoring audits.']].map(([n,label,stack,body]) => <article key={n}><small>{n} / {label}</small><h3>{stack}</h3><p>{body}</p></article>)}
              </div>
              <CodeBlock id="map" label="Repository / project map" value={PROJECT_MAP} copyState={copyState} onCopy={copy} />
            </section>

            <section id="tiers" className="docs-field-chapter" aria-labelledby="docs-tiers-title">
              <ChapterHeading id="docs-tiers-title" index="06" eyebrow="Plans & limits" title="Capacity is explicit before a run starts." body="Message and token budgets are enforced server-side. Agent Mode is included with Pro and available to Plus through the paid add-on." />
              <div className="docs-plan-ledger" role="region" aria-label="Plan limits table" tabIndex={0}>
                <table>
                  <caption className="docs-sr-only">Guest, Free, Plus, and Pro limits</caption>
                  <thead><tr><th scope="col">Plan</th><th scope="col">Messages / day</th><th scope="col">Tokens / day</th><th scope="col">Personas</th><th scope="col">Agent Mode</th></tr></thead>
                  <tbody>{PLAN_ROWS.map((row) => <tr key={row[0]}>{row.map((cell,index) => index === 0 ? <th key={cell} scope="row">{cell}</th> : <td key={cell}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="docs-tier-actions"><p>Pro also uses a rolling 45-message / 5-hour window. Plus add-on runs retain Plus limits.</p><button type="button" onClick={() => navigate('/pricing')}>Compare full pricing <ArrowRight aria-hidden="true" /></button></div>
            </section>

            <section id="security" className="docs-field-chapter docs-field-chapter--last" aria-labelledby="docs-security-title">
              <ChapterHeading id="docs-security-title" index="07" eyebrow="Security & boundaries" title="Defence belongs inside the runtime." body="Transport, identity, payments, prompts, secrets, and local execution each fail at a named boundary." />
              <div className="docs-security-grid">
                {SECURITY_CONTROLS.map(([n,label,body]) => <article key={n}><header><small>{n}</small><ShieldCheck aria-hidden="true" /></header><strong>{label}</strong><p>{body}</p></article>)}
              </div>
              <div className="docs-condura-boundary">
                <div><h3>The browser does not control your machine.</h3></div>
                <p>Arena handles web research. Opening desktop apps, writing local files, or running shell commands requires Condura—a separate local-first daemon. Never report local work as completed without that handoff.</p>
              </div>
              <div className="docs-field-close"><div><h3>Choose the surface. Inspect the result.</h3></div><div><button type="button" onClick={() => navigate('/product')}>Explore product</button><button type="button" onClick={() => navigate('/signin?tab=signup')}>Start free <ArrowRight aria-hidden="true" /></button></div></div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
