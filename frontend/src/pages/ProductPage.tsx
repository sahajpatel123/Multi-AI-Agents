import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';

export function ProductPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div style={{ background: '#F5F0E8', minHeight: '100vh' }}>
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
        {/* Hero */}
        <div className="animate-fade-up" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>Choose your mode</p>
          <h1 style={{ fontSize: '52px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '1rem' }}>
            Two ways to <span style={{ color: '#C4956A', fontStyle: 'italic' }}>think.</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#6B6460', maxWidth: '420px', lineHeight: 1.75, marginBottom: '3rem' }}>
            Arena for debate. Agent for depth. Same intelligence, two different engines.
          </p>
        </div>

        {/* Two Product Cards */}
        <div className="product-cards-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '2rem' }}>
          {/* Arena Mode Card */}
          <button
            onClick={() => navigate('/app')}
            className="product-parchment-card"
            style={{
              background: '#EDE4D6',
              border: '1px solid #C4B89A',
              borderRadius: '14px',
              padding: '32px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease, transform 0.2s ease',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '420px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#C4956A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#C4B89A';
            }}
          >
            <div
              style={{
                background: 'rgba(196, 149, 106, 0.15)',
                color: '#8C7355',
                border: '0.5px solid #D4C4B0',
                fontSize: '11px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: '20px',
                marginBottom: '20px',
                display: 'inline-block',
                alignSelf: 'flex-start',
              }}
            >
              Active now
            </div>

            <div
              style={{
                color: '#2C1810',
                fontSize: '52px',
                fontWeight: 500,
                fontFamily: 'Georgia, serif',
                opacity: 0.12,
                marginBottom: '14px',
                lineHeight: 1,
              }}
            >
              01
            </div>

            <h2
              style={{
                margin: 0,
                color: '#2C1810',
                fontSize: '26px',
                fontWeight: 500,
                fontFamily: 'Georgia, serif',
                marginBottom: '6px',
                lineHeight: 1.2,
              }}
            >
              Arena Mode
            </h2>
            <p
              style={{
                color: '#8C7355',
                fontSize: '15px',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                marginBottom: '20px',
              }}
            >
              Four minds. One question.
            </p>

            <div style={{ marginBottom: 'auto' }}>
              {['Four AI personas compete simultaneously', 'Scored and ranked automatically', 'Challenge, debate, or go 1-on-1', 'Winner surfaces with a reason why'].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '9px' }}>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: 'rgba(196, 149, 106, 0.15)',
                      border: '0.5px solid rgba(196, 149, 106, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#C4956A', lineHeight: 1 }}>✓</span>
                  </div>
                  <span style={{ fontSize: '14px', color: '#4A3728' }}>{feature}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                borderTop: '0.5px solid rgba(212, 196, 176, 0.6)',
                marginTop: '1.5rem',
                paddingTop: '22px',
              }}
            >
              <div
                style={{
                  color: '#C4956A',
                  fontSize: '14px',
                  fontFamily: 'Georgia, serif',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.color = '#8C7355';
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.color = '#C4956A';
                }}
              >
                Enter Arena →
              </div>
            </div>
          </button>

          {/* Agent Mode Card */}
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                setRedirectIntent('/agent');
                navigate('/signin');
                return;
              }
              navigate('/agent');
            }}
            className="product-parchment-card"
            style={{
              background: '#EDE4D6',
              border: '1px solid #C4B89A',
              borderRadius: '14px',
              padding: '32px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease, transform 0.2s ease',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '420px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#C4956A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#C4B89A';
            }}
          >
            <div
              style={{
                background: 'rgba(196, 149, 106, 0.15)',
                color: '#8C7355',
                border: '0.5px solid #D4C4B0',
                fontSize: '11px',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: '20px',
                marginBottom: '20px',
                display: 'inline-block',
                alignSelf: 'flex-start',
              }}
            >
              Active now
            </div>

            <div
              style={{
                color: '#2C1810',
                fontSize: '52px',
                fontWeight: 500,
                fontFamily: 'Georgia, serif',
                opacity: 0.12,
                marginBottom: '14px',
                lineHeight: 1,
              }}
            >
              02
            </div>

            <h2
              style={{
                margin: 0,
                color: '#2C1810',
                fontSize: '26px',
                fontWeight: 500,
                fontFamily: 'Georgia, serif',
                marginBottom: '6px',
                lineHeight: 1.2,
              }}
            >
              Agent Mode
            </h2>
            <p
              style={{
                color: '#8C7355',
                fontSize: '15px',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                marginBottom: '20px',
              }}
            >
              Plan. Research. Solve. Verify.
            </p>

            <div style={{ marginBottom: 'auto' }}>
              {['7-stage intelligent pipeline', 'Planner → Researcher → Solver → Critic', 'Verifier checks every claim', 'Synthesizer builds the final answer'].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '9px' }}>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: 'rgba(196, 149, 106, 0.15)',
                      border: '0.5px solid rgba(196, 149, 106, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#C4956A', lineHeight: 1 }}>✓</span>
                  </div>
                  <span style={{ fontSize: '14px', color: '#4A3728' }}>{feature}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                borderTop: '0.5px solid rgba(212, 196, 176, 0.6)',
                marginTop: '1.5rem',
                paddingTop: '22px',
              }}
            >
              <div
                style={{
                  color: '#C4956A',
                  fontSize: '14px',
                  fontFamily: 'Georgia, serif',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.color = '#8C7355';
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.color = '#C4956A';
                }}
              >
                Enter Agent →
              </div>
            </div>
          </button>
        </div>

        {/* Comparison Pills */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '1rem' }}>Not sure which to use?</p>
          <div className="product-comparison" style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ background: '#F0EBE3', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '6px 16px', fontSize: '12px', color: '#6B6460' }}>
              Arena → opinions, decisions, debate
            </div>
            <div style={{ background: '#F0EBE3', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '6px 16px', fontSize: '12px', color: '#6B6460' }}>
              Agent → research, code, complex tasks
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
