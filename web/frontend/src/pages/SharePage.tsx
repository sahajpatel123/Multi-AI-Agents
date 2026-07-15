import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { AGENTS } from '../types';
import { PERSONAS } from '../data/personas';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';

const MAX_PARAM_LEN = 2000;

function sanitizeParam(raw: string | null, max = MAX_PARAM_LEN): string {
  if (!raw) return '';
  try {
    // React Router already decodes once; tolerate double-encoding.
    let value = raw;
    if (/%[0-9A-Fa-f]{2}/.test(value)) {
      try {
        value = decodeURIComponent(value);
      } catch {
        /* keep as-is */
      }
    }
    return value.replace(/\u0000/g, '').slice(0, max).trim();
  } catch {
    return '';
  }
}

function resolveAgent(agentId: string): { name: string; color: string; oneLiner: string } {
  if (agentId && AGENTS[agentId]) {
    const a = AGENTS[agentId];
    return {
      name: a.name,
      color: a.color,
      oneLiner: a.oneLiner || 'A mind on Arena',
    };
  }
  const persona = PERSONAS.find((p) => p.id === agentId);
  if (persona) {
    return { name: persona.name, color: persona.color, oneLiner: persona.quote };
  }
  return {
    name: agentId ? agentId.replace(/_/g, ' ') : 'An Arena mind',
    color: '#C4956A',
    oneLiner: 'Four minds. One question.',
  };
}

/**
 * Public landing for links copied from Arena share dropdown.
 * Query: ?agent=&prompt=&response=
 */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const agentId = sanitizeParam(params.get('agent'), 64);
  const prompt = sanitizeParam(params.get('prompt'));
  const response = sanitizeParam(params.get('response'));
  const agent = useMemo(() => resolveAgent(agentId), [agentId]);

  const hasContent = Boolean(response || prompt);

  const goTry = () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    setRedirectIntent('/app');
    navigate('/signin');
  };

  return (
    <div style={{ background: '#F5F0E8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main
        style={{
          flex: 1,
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
          padding: '48px 24px 64px',
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#C4956A',
            marginBottom: 12,
          }}
        >
          Shared from Arena
        </p>

        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 36px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: '#1A1714',
            margin: '0 0 28px',
            lineHeight: 1.2,
          }}
        >
          One mind. One take.
        </h1>

        {!hasContent ? (
          <div
            className="arena-empty-state"
            style={{
              background: '#FAF7F4',
              border: '0.5px solid #E0D8D0',
              borderRadius: 16,
              padding: '32px 24px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 15, color: '#4A3728', margin: '0 0 8px', fontWeight: 500 }}>
              This share link is empty or expired
            </p>
            <p style={{ fontSize: 13, color: '#8C7355', margin: '0 0 20px', lineHeight: 1.6 }}>
              Ask something in Arena and share a take from any of the four minds.
            </p>
            <button type="button" className="arena-btn arena-btn--primary arena-btn--md" onClick={goTry}>
              Try Arena →
            </button>
          </div>
        ) : (
          <article
            style={{
              background: '#FAF7F4',
              border: '0.5px solid #E0D8D0',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 12px 32px rgba(44,24,16,0.06)',
            }}
          >
            <div style={{ height: 3, background: agent.color }} />
            <div style={{ padding: '24px 22px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: agent.color,
                    boxShadow: `0 0 0 3px ${agent.color}33`,
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1714' }}>{agent.name}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#A89070',
                  }}
                >
                  Arena take
                </span>
              </div>

              {prompt ? (
                <div style={{ marginBottom: 18 }}>
                  <p
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#A89070',
                      margin: '0 0 6px',
                    }}
                  >
                    The question
                  </p>
                  <p
                    style={{
                      fontSize: 14,
                      color: '#6B6460',
                      fontStyle: 'italic',
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    {prompt}
                  </p>
                </div>
              ) : null}

              {response ? (
                <blockquote
                  style={{
                    margin: 0,
                    padding: '14px 16px',
                    background: '#FFFFFF',
                    borderLeft: `3px solid ${agent.color}`,
                    borderRadius: '0 12px 12px 0',
                  }}
                >
                  <p
                    style={{
                      fontSize: 16,
                      color: '#1A1714',
                      lineHeight: 1.7,
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {response}
                  </p>
                </blockquote>
              ) : (
                <p style={{ fontSize: 14, color: '#8C7355', fontStyle: 'italic', margin: 0 }}>
                  {agent.oneLiner}
                </p>
              )}
            </div>

            <div
              style={{
                borderTop: '0.5px solid #E0D8D0',
                padding: '18px 22px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <p style={{ fontSize: 13, color: '#6B6460', margin: 0, lineHeight: 1.6 }}>
                Four minds answer every question. Challenge any take. Keep the best.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" className="arena-btn arena-btn--primary arena-btn--md" onClick={goTry}>
                  {isAuthenticated ? 'Open Arena' : 'Try this in Arena'} →
                </button>
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--md"
                  onClick={() => navigate('/product')}
                >
                  How it works
                </button>
              </div>
            </div>
          </article>
        )}
      </main>

      <Footer />
    </div>
  );
}
