import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export function AboutPage() {
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
        <div className="animate-fade-up about-hero" style={{ marginBottom: '4rem', maxWidth: '680px', marginInline: 'auto' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>The story behind Arena</p>

          <div className="about-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '48px', alignItems: 'start' }}>
            {/* Left Column */}
            <div>
              <h1 style={{ fontSize: '52px', fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.1, marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', color: '#1A1714' }}>Built by one</span>
                <span style={{ display: 'block', color: '#C4956A', fontStyle: 'italic' }}>person.</span>
              </h1>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '460px' }}>
                <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                  Arena started as a simple question: why do we accept a single AI's answer when we know every perspective is shaped by assumptions? Most AI tools are optimized to agree with you. Arena is built to challenge you.
                </p>
                <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                  I'm Sahaj Patel — an 18-year-old pursuing BCA in AI & ML, building Arena as a real product while studying. The goal was always bigger than a class project: a platform that makes AI reasoning transparent, competitive, and genuinely useful.
                </p>
                <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                  Arena is the first product in a larger vision — a platform where multiple AI agents don't just answer questions, but debate, verify, and challenge each other to surface the truth. The persona library, Agent mode, and the full dual-mode architecture are all in active development.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Arena Story Section */}
        <div style={{ marginTop: '4rem' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 500, color: '#1A1714', marginBottom: '1.5rem' }}>What Arena actually is</h2>

          <div className="story-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {/* Card 1 */}
            <div style={{ background: '#F0EBE3', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ fontSize: '32px', fontWeight: 500, color: '#C4956A', marginBottom: '.8rem' }}>01</div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>The problem</h3>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.65 }}>
                Single AI tools are optimized to be agreeable. They tell you what you want to hear. Arena is built around the opposite principle — disagreement produces better answers.
              </p>
            </div>

            {/* Card 2 */}
            <div style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ fontSize: '32px', fontWeight: 500, color: '#C4956A', marginBottom: '.8rem' }}>02</div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>The approach</h3>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.65 }}>
                Arena is powered by a carefully selected combination of leading AI models, each matched to the reasoning style of its persona. The minds do not coordinate — they compete. A fifth system scores and ranks them. The best answer wins on merit.
              </p>
            </div>

            {/* Card 3 */}
            <div style={{ background: '#1A1714', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ fontSize: '32px', fontWeight: 500, color: 'rgba(250,247,244,0.15)', marginBottom: '.8rem' }}>03</div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FAF7F4', marginBottom: '.5rem' }}>The vision</h3>
              <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.6)', lineHeight: 1.65 }}>
                Arena mode is the start. Agent mode — a 7-stage pipeline of specialized AI agents — is in development. The end goal is a platform where AI agents don't just answer, but plan, research, solve, critique, verify, and synthesize.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <p style={{ fontSize: '16px', color: '#6B6460', marginBottom: '1rem' }}>Arena is live and free to try.</p>
          <button
            onClick={() => navigate('/app')}
            style={{
              padding: '12px 32px',
              borderRadius: '999px',
              background: '#1A1714',
              color: '#FAF7F4',
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Try Arena →
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
