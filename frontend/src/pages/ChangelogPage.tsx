import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const CHANGELOG_ENTRIES = [
  {
    date: 'March 2026',
    version: 'v0.6',
    title: 'Payments, Tier System & Security',
    badge: {
      label: 'Latest',
      background: '#C4956A',
      color: '#FAF7F4',
    },
    items: [
      '[NEW] Razorpay subscription payments — monthly and annual',
      '[NEW] Three tiers: Explorer (free), Plus, and Pro',
      '[NEW] Persona access control — free users get 6 minds, Plus and Pro unlock all 16',
      '[NEW] Upgrade modal with direct checkout from any locked feature',
      '[NEW] Account page with subscription management and cancellation',
      '[NEW] Login brute force protection — 5 attempts then 1 hour lockout',
      '[NEW] Request size limits, security headers, CSRF protection',
      '[NEW] Prompt injection detection',
      '[NEW] Token blacklisting on logout',
      '[IMPROVED] Cross-domain cookie authentication for Vercel + Render deployment',
      '[IMPROVED] Usage counter in sidebar showing daily messages remaining',
    ],
  },
  {
    date: 'March 2026',
    version: 'v0.5',
    title: 'Multi-Model Routing Across All 16 Personas',
    items: [
      '[NEW] DeepSeek V3 powers 6 personas — Analyst, Scientist, Economist, Stoic, Engineer, First Principles',
      '[NEW] GPT-4o powers Philosopher and Historian',
      '[NEW] GPT-4o-mini powers Pragmatist and Optimist',
      '[NEW] Grok-3 powers The Strategist',
      "[NEW] Grok-3-mini powers Contrarian, Futurist, Devil's Advocate",
      '[NEW] Claude Sonnet powers Ethicist and Empath',
      '[NEW] Automatic fallback to Claude if any provider is unavailable',
      '[NEW] Central model routing table with cost estimation per call',
      '[IMPROVED] 70% reduction in API cost per message through intelligent model matching',
    ],
  },
  {
    date: 'February 2026',
    version: 'v0.4',
    title: 'Shared Infrastructure Phases 1-5',
    items: [
      '[NEW] Memory system — short term in RAM, long term in database',
      '[NEW] Session compression engine using AI to summarise past context',
      '[NEW] Memory relevance ranking — top 3 relevant memories injected per prompt',
      '[NEW] User preference store — tracks communication style, favourite personas, topic history',
      '[NEW] Agent stance archive — each persona remembers its position on topics over time',
      '[NEW] Observability layer — persona drift logs, scoring audits, UX event tracking',
      '[NEW] Latency tracking per pipeline stage — input, agents, scoring',
      '[NEW] Analytics summary endpoint',
      '[NEW] Persona library database with all 16 personas seeded',
      '[NEW] User panel saving — custom panels stored per account',
      '[NEW] Saved responses — bookmark the best answers',
    ],
  },
  {
    date: 'February 2026',
    version: 'v0.3',
    title: '16 Personas, Debate Mode & Homepage Redesign',
    items: [
      '[NEW] 16 distinct AI personas — each with unique reasoning mandate, temperature, and system prompt',
      '[NEW] Debate mode — challenge any mind and watch the other three react in real time',
      '[NEW] 1-on-1 focused chat with any persona',
      '[NEW] Persona library page with swap modal — build your own panel of 4',
      '[NEW] Live debate simulation in hero — pre-written debates cycle through 3 topics with typing animations',
      '[NEW] Spring letter animation on hero headline — one time on load',
      '[NEW] Blur-to-sharp section entrance on scroll',
      '[NEW] Noise texture overlay for editorial quality',
      '[NEW] Scroll-triggered counter in manifesto section',
      '[NEW] Agent state machine in hero — idle, listening, thinking, typing, winning, losing states',
      '[IMPROVED] Debate mode UI — Colosseum layout with timeline, reaction cards, round system',
    ],
  },
  {
    date: 'January 2026',
    version: 'v0.2',
    title: 'Auth, Sessions & Multi-Page Site',
    items: [
      '[NEW] User authentication — JWT httpOnly cookies, bcrypt password hashing',
      '[NEW] Session history in sidebar — restore any past conversation',
      '[NEW] Guest rate limiting — IP based, 3 messages per day',
      '[NEW] Registered user rate limiting — 5 messages per day on free tier',
      '[NEW] Product page, Pricing page, About page, Changelog page',
      '[NEW] Terms and Privacy pages',
      '[NEW] Sign in and registration pages',
      '[NEW] Protected routes — /app requires authentication',
      '[NEW] Gate screen for unauthenticated users with sign in prompt',
      '[NEW] User menu with dropdown',
      '[NEW] Contradiction detector — banner when agents contradict their previous positions',
      '[NEW] Share button — Copy Link, Copy Text, X, WhatsApp, Email',
      '[NEW] Agent leaderboard with animated score bars',
      '[NEW] Response action row — Copy, Like, Dislike, Share, Save',
      '[IMPROVED] Navbar with sticky blur effect on scroll',
    ],
  },
  {
    date: 'January 2026',
    version: 'v0.1',
    title: 'Initial Arena Build',
    badge: {
      label: 'First build',
      background: '#F0EBE3',
      color: '#6B6460',
    },
    items: [
      '[NEW] Core Arena — 4 AI agents answer every question in parallel',
      '[NEW] 5th AI scoring layer — logic, directness, originality',
      '[NEW] Winner detection — best answer surfaces automatically',
      '[NEW] 4 default personas — Analyst, Philosopher, Pragmatist, Contrarian',
      '[NEW] Grok API integration for The Contrarian persona',
      '[NEW] Input pipeline — toxicity filtering, prompt categorisation',
      '[NEW] Persona integrity engine — drift guard and overlap filter',
      '[NEW] Tool integrations — calculator, web search, datetime',
      '[NEW] Cost tracker per request',
      '[NEW] FastAPI backend with SQLite database',
      '[NEW] React + TypeScript + Vite frontend',
      '[NEW] Deployment on Render (backend) and Vercel (frontend)',
    ],
  },
];

export function ChangelogPage() {
  return (
    <div style={{ background: '#FAF7F4', minHeight: '100vh' }}>
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
        .animate-fade-up { animation: fadeUp 500ms ease 100ms backwards; }
      `}</style>

      <Navbar />

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '64px 24px' }}>
        <div className="animate-fade-up" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>What's new</p>
          <h1 style={{ fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '1rem' }}>Changelog</h1>
          <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '3rem' }}>Every update, improvement, and fix — documented.</p>
        </div>

        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          <div style={{ position: 'absolute', left: '4px', top: 0, bottom: 0, width: '1px', background: '#E0D8D0' }} />

          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <div key={idx} className="changelog-entry" style={{ position: 'relative', marginBottom: '2.5rem' }}>
              <div className="timeline-dot breathe" style={{ position: 'absolute', left: '-2rem', top: '8px', width: '8px', height: '8px', borderRadius: '50%', background: '#C4956A' }} />

              <div>
                <p style={{ fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '.4rem' }}>{entry.date}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '.8rem' }}>
                  <div style={{ background: '#F0EBE3', color: '#1A1714', fontSize: '11px', padding: '3px 10px', borderRadius: '999px', display: 'inline-block' }}>{entry.version}</div>
                  {entry.badge ? (
                    <div
                      style={{
                        background: entry.badge.background,
                        color: entry.badge.color,
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        display: 'inline-block',
                      }}
                    >
                      {entry.badge.label}
                    </div>
                  ) : null}
                </div>

                <div className="changelog-card" style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '14px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714', marginBottom: '1rem' }}>{entry.title}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                    {entry.items.map((item) => (
                      <p key={item} style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.65 }}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '13px', color: '#B0A9A2', textAlign: 'center', marginTop: '3rem', marginBottom: '2rem' }}>
          Arena is actively being built. New updates ship regularly.
        </p>
      </div>

      <Footer />
    </div>
  );
}
