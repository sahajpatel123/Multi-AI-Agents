import { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import '../styles/verdict-docs.css';

const CHAPTERS = [
  ['start', 'Start here', 'overview quick start setup install backend frontend'],
  ['concepts', 'Core concepts', 'arena personas panel judge scoring debate focus'],
  ['agent', 'Agent Mode', 'pipeline planner researcher solver critic verifier synthesizer judge'],
  ['api', 'API surface', 'endpoints auth prompt stream debate agent payments calibration'],
  ['architecture', 'Architecture', 'react typescript fastapi sqlalchemy postgres providers mcp'],
  ['tiers', 'Plans & limits', 'guest free plus pro tokens messages pricing'],
  ['security', 'Security', 'cors headers rate limits passwords encryption webhook injection'],
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

const API_GROUPS = [
  ['Authentication', 'POST /api/auth/register · login · refresh · logout\nGET /api/auth/me'],
  ['Arena', 'POST /api/prompt · /api/prompt/stream\nPOST /api/debate/stream · /api/discuss/stream'],
  ['Agent Mode', 'POST /api/agent/run · orchestrate · refine · challenge\nGET /api/agent/status/:id · result/:id · history'],
  ['Account', 'GET /api/user/usage · tier · answer-feedback-stats\nPATCH /api/user/profile'],
  ['Calibration', 'POST /api/calibration/rate\nGET /api/calibration/stats · rating/:task'],
  ['Payments', 'POST /api/payments/subscribe · verify · cancel · webhook'],
] as const;

const PIPELINE = ['PLAN', 'RESEARCH', 'SOLVE', 'CRITIQUE', 'VERIFY', 'SYNTHESIZE', 'JUDGE'];

function CodeBlock({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="docs-code">
      <header><span>{label}</span><button type="button" onClick={onCopy} aria-label={`${copied ? 'Copied' : 'Copy'} ${label}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'COPIED' : 'COPY'}</button></header>
      <pre><code>{value}</code></pre>
    </div>
  );
}

export function DocsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => new Set(CHAPTERS.filter(([, label, keywords]) => !normalized || `${label} ${keywords}`.toLowerCase().includes(normalized)).map(([id]) => id)), [normalized]);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => current === id ? null : current), 1400);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="docs-page">
      <Navbar />
      <main id="main-content" className="docs-main" tabIndex={-1} aria-labelledby="docs-title">
        <header className="docs-hero">
          <div>
            <p className="docs-kicker"><i />ARENA / DOCUMENTATION / V1</p>
            <h1 id="docs-title">Build with<br/><span>multiple minds.</span></h1>
          </div>
          <div className="docs-hero__brief">
            <p>The complete operating guide for Arena, Agent Mode, personas, scoring, APIs, deployment, and security.</p>
            <div className="docs-search"><Search size={17} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search documentation" placeholder="Search documentation"/>{query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear documentation search"><X size={16}/></button> : null}</div>
            <div className="docs-hero__actions"><button type="button" onClick={() => navigate('/signin?tab=signup')}>OPEN ARENA FREE <ArrowRight size={14}/></button><button type="button" onClick={() => navigate('/product')}>PRODUCT OVERVIEW</button></div>
            <dl><div><dt>16</dt><dd>PERSONAS</dd></div><div><dt>07</dt><dd>AGENT STAGES</dd></div><div><dt>04</dt><dd>MODEL PROVIDERS</dd></div></dl>
          </div>
        </header>

        <div className="docs-layout">
          <aside className="docs-toc" aria-label="Documentation chapters">
            <small>ON THIS PAGE</small>
            <nav>{CHAPTERS.map(([id, label], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{label}</a>)}</nav>
            <button type="button" onClick={() => navigate('/changelog')}>VIEW CHANGELOG <ArrowRight size={14}/></button>
          </aside>

          <div className="docs-content">
            {visible.size === 0 ? <section className="docs-empty" aria-live="polite"><small>NO MATCHES</small><h2>Nothing found for “{query}”.</h2><button type="button" onClick={() => setQuery('')}>CLEAR SEARCH</button></section> : null}

            {visible.has('start') ? <section id="start" className="docs-chapter">
              <header><small>01 / START HERE</small><h2>From clone to first verdict.</h2><p>Arena runs as a React client and FastAPI service. PostgreSQL is preferred; SQLite remains available for local development.</p></header>
              <div className="docs-callout"><b>PREREQUISITES</b><span>Python 3.11+</span><span>Node.js 18+</span><span>Anthropic API key</span><span>PostgreSQL optional</span></div>
              <div className="docs-code-grid"><CodeBlock label="BACKEND / TERMINAL 01" value={BACKEND_SETUP} onCopy={() => copy('backend', BACKEND_SETUP)} copied={copied === 'backend'}/><CodeBlock label="FRONTEND / TERMINAL 02" value={FRONTEND_SETUP} onCopy={() => copy('frontend', FRONTEND_SETUP)} copied={copied === 'frontend'}/></div>
              <div className="docs-note"><strong>LOCAL ENDPOINTS</strong><p>UI: <code>http://localhost:5173</code> · API: <code>http://localhost:8000</code> · Health: <code>/api/health</code></p></div>
            </section> : null}

            {visible.has('concepts') ? <section id="concepts" className="docs-chapter">
              <header><small>02 / CORE CONCEPTS</small><h2>One question. Structured disagreement.</h2><p>Arena does not average answers into consensus. Four selected reasoning styles answer independently; a fifth model scores the evidence and names a winner.</p></header>
              <div className="docs-concepts">
                {[['01','PANEL','Four editable persona slots selected from sixteen reasoning styles.'],['02','PARALLEL RUN','All four answers stream independently, preserving disagreement.'],['03','JUDGMENT','A fifth model scores relevance, insight, clarity, and intellectual honesty.'],['04','FOLLOW-THROUGH','Debate challenges a claim; Focus continues privately with one persona.']].map(([n,title,copy])=><article key={n}><small>{n}</small><h3>{title}</h3><p>{copy}</p></article>)}
              </div>
              <div className="docs-score"><div><span>RELEVANCE</span><b>Does it answer the actual question?</b></div><div><span>INSIGHT</span><b>Does it reveal something non-obvious?</b></div><div><span>CLARITY</span><b>Can the reasoning be inspected?</b></div><div><span>HONESTY</span><b>Are limits and uncertainty named?</b></div></div>
            </section> : null}

            {visible.has('agent') ? <section id="agent" className="docs-chapter">
              <header><small>03 / AGENT MODE</small><h2>Research that attacks itself.</h2><p>Agent Mode is for long-form work that should not end after one generation. Each stage hands an explicit artifact to the next, with refinement loops when verification fails.</p></header>
              <div className="docs-pipeline">{PIPELINE.map((stage, index)=><article key={stage}><small>{String(index + 1).padStart(2,'0')}</small><i/><b>{stage}</b></article>)}</div>
              <div className="docs-note"><strong>TOOLS & CONTEXT</strong><p>Attach files up to 10 MB, connect MCP sources such as Notion or GitHub, save recurring questions to Watchlist, and preserve compressed research memory between runs.</p></div>
            </section> : null}

            {visible.has('api') ? <section id="api" className="docs-chapter">
              <header><small>04 / API SURFACE</small><h2>Typed routes. Streaming where it matters.</h2><p>The frontend uses a typed API client. Long-running answer, debate, discussion, and agent operations stream progress rather than blocking the interface.</p></header>
              <div className="docs-api">{API_GROUPS.map(([title, routes])=><article key={title}><h3>{title}</h3><pre>{routes}</pre></article>)}</div>
            </section> : null}

            {visible.has('architecture') ? <section id="architecture" className="docs-chapter">
              <header><small>05 / ARCHITECTURE</small><h2>Clear boundaries from prompt to verdict.</h2><p>Provider routing, orchestration, scoring, memory, cost controls, and observability remain separate so each can be tested and evolved independently.</p></header>
              <div className="docs-architecture"><article><small>CLIENT</small><h3>React 18 · TypeScript · Vite</h3><p>Route-split pages, typed API calls, streaming UI, auth/tier/panel contexts.</p></article><article><small>SERVICE</small><h3>FastAPI · SQLAlchemy · Alembic</h3><p>Feature routers, request middleware, schema validation, PostgreSQL-first persistence.</p></article><article><small>INTELLIGENCE</small><h3>Anthropic · OpenAI · xAI · DeepSeek</h3><p>Task-aware model routes with automatic Claude fallback when optional keys are absent.</p></article><article><small>RUNTIME</small><h3>SSE · MCP · JSON observability</h3><p>Token streaming, external context tools, latency and scoring audits, persona drift checks.</p></article></div>
              <CodeBlock label="PROJECT MAP" value={`backend/arena/core     orchestration, scoring, memory, tools\nbackend/arena/routes   FastAPI feature routers\nweb/frontend/src       React pages, components, contexts\nweb/frontend/src/api.ts typed backend client`} onCopy={() => copy('map', 'backend/arena/core\nbackend/arena/routes\nweb/frontend/src')} copied={copied === 'map'}/>
            </section> : null}

            {visible.has('tiers') ? <section id="tiers" className="docs-chapter">
              <header><small>06 / PLANS & LIMITS</small><h2>Capacity scales with the work.</h2><p>Limits are enforced server-side and surfaced in product before a run begins.</p></header>
              <p className="docs-table-hint">SWIPE / SCROLL TO COMPARE ALL COLUMNS →</p>
              <div className="docs-table" role="table" aria-label="Plan limits. Scroll horizontally to compare all columns." tabIndex={0}><div role="row"><b>PLAN</b><b>DAILY MESSAGES</b><b>DAILY TOKENS</b><b>PERSONAS</b></div>{[['Guest','3','25k','6'],['Free','5','25k','6'],['Plus','15','100k','16'],['Pro','35 + rolling window','300k','16']].map(row=><div role="row" key={row[0]}>{row.map(cell=><span role="cell" key={cell}>{cell}</span>)}</div>)}</div>
              <button className="docs-inline-cta" type="button" onClick={() => navigate('/pricing')}>COMPARE FULL PRICING <ArrowRight size={15}/></button>
            </section> : null}

            {visible.has('security') ? <section id="security" className="docs-chapter docs-chapter--last">
              <header><small>07 / SECURITY</small><h2>Defence is part of the runtime.</h2><p>Security controls sit at transport, identity, payment, prompt, and tool boundaries.</p></header>
              <ul className="docs-security">{['Request-size middleware: 10 KB default, 10 MB for uploads.','CORS restricted by the ALLOWED_ORIGINS environment allowlist.','HSTS in production, X-Frame-Options DENY, and security headers on every response.','Global IP throttling plus user-tier and endpoint-specific rate limits.','bcrypt with 12 rounds and SHA-256 prehash; legacy verification retained for migration.','Razorpay webhook HMAC verification and Fernet encryption for stored MCP tokens.','Prompt-injection signatures and a two-tier rules-plus-model toxicity gate.'].map((item,index)=><li key={item}><span>0{index + 1}</span>{item}</li>)}</ul>
              <div className="docs-final"><div><small>NEXT</small><h3>Choose the right surface.</h3></div><div><button type="button" onClick={() => navigate('/product')}>EXPLORE PRODUCT</button><button type="button" onClick={() => navigate('/signin?tab=signup')}>START FREE <ArrowRight size={14}/></button></div></div>
            </section> : null}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
