import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export function ProductPage() {
  const navigate = useNavigate();

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '2rem' }}>
          {/* Arena Mode Card */}
          <button
            onClick={() => navigate('/app')}
            style={{
              background: '#1A1714',
              borderRadius: '20px',
              padding: '2.5rem',
              cursor: 'pointer',
              transition: 'transform 200ms ease',
              border: 'none',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '420px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ background: '#C4956A', color: '#FAF7F4', fontSize: '11px', padding: '4px 12px', borderRadius: '999px', display: 'inline-block', alignSelf: 'flex-start', marginBottom: '1.5rem' }}>Active now</div>

            <div style={{ fontSize: '64px', fontWeight: 500, color: 'rgba(250,247,244,0.1)', lineHeight: 1, marginBottom: '.5rem' }}>01</div>

            <h2 style={{ fontSize: '28px', fontWeight: 500, color: '#FAF7F4', letterSpacing: '-.02em', marginBottom: '.5rem' }}>Arena Mode</h2>
            <p style={{ fontSize: '14px', color: 'rgba(250,247,244,0.5)', marginBottom: '1.5rem' }}>Four minds. One question.</p>

            <div style={{ marginBottom: 'auto' }}>
              {['Four AI personas compete simultaneously', 'Scored and ranked automatically', 'Challenge, debate, or go 1-on-1', 'Winner surfaces with a reason why'].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '.6rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#C4956A', color: '#FAF7F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0 }}>✓</div>
                  <span style={{ fontSize: '13px', color: 'rgba(250,247,244,0.75)' }}>{feature}</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '0.5px solid rgba(250,247,244,0.1)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: '13px', color: '#C4956A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Enter Arena →
              </div>
            </div>
          </button>

          {/* Agent Mode Card */}
          <div
            style={{
              background: '#F0EBE3',
              borderRadius: '20px',
              padding: '2.5rem',
              cursor: 'not-allowed',
              opacity: 0.75,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '420px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: '20px', right: '-28px', transform: 'rotate(45deg)', background: '#1A1714', color: '#FAF7F4', fontSize: '10px', padding: '4px 40px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Coming Soon</div>

            <div style={{ fontSize: '64px', fontWeight: 500, color: 'rgba(26,23,20,0.08)', lineHeight: 1, marginBottom: '.5rem' }}>02</div>

            <h2 style={{ fontSize: '28px', fontWeight: 500, color: '#1A1714', letterSpacing: '-.02em', marginBottom: '.5rem' }}>Agent Mode</h2>
            <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '1.5rem' }}>Plan. Research. Solve. Verify.</p>

            <div style={{ marginBottom: 'auto' }}>
              {['7-stage intelligent pipeline', 'Planner → Researcher → Solver → Critic', 'Verifier checks every claim', 'Synthesizer builds the final answer'].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '.6rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#E0D8D0', color: '#6B6460', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0 }}>✓</div>
                  <span style={{ fontSize: '13px', color: '#6B6460' }}>{feature}</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '0.5px solid #E0D8D0', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: '13px', color: '#6B6460' }}>
                Coming soon — join waitlist
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Pills */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '1rem' }}>Not sure which to use?</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
