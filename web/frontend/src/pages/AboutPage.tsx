import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';

export function AboutPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const goArena = () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    setRedirectIntent('/app');
    navigate('/signin');
  };

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
        @media (max-width: 768px) {
          .story-grid { grid-template-columns: 1fr !important; }
          .about-hero h1 { font-size: 36px !important; }
        }
      `}</style>

      <Navbar />

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '64px 24px' }}>
        {/* Hero */}
        <div className="animate-fade-up about-hero" style={{ marginBottom: '4rem', maxWidth: '680px', marginInline: 'auto' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>The story behind Arena</p>

          <div className="about-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '48px', alignItems: 'start' }}>
            <div>
              <h1 style={{ fontSize: '52px', fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.1, marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', color: '#1A1714' }}>Reasoning,</span>
                <span style={{ display: 'block', color: '#C4956A', fontStyle: 'italic' }}>made visible.</span>
              </h1>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '460px' }}>
                <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                  Arena started as a simple question: why do we accept a single AI&apos;s answer when we know every perspective is shaped by assumptions? Most AI tools are optimized to agree with you. Arena is built to challenge you.
                </p>
                <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                  Multiple minds answer in parallel, a scorer ranks them, and you can debate or dig deeper. Agent Mode runs a seven-stage research pipeline for harder questions — still on the web, still honest about what the browser cannot do.
                </p>
                <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                  On-device work (local apps, files, long machine loops) routes to Condura. Arena never pretends to control your computer from the browser.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Arena Story Section */}
        <div style={{ marginTop: '4rem' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 500, color: '#1A1714', marginBottom: '1.5rem' }}>What Arena actually is</h2>

          <div className="story-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ background: '#F0EBE3', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ fontSize: '32px', fontWeight: 500, color: '#C4956A', marginBottom: '.8rem' }}>01</div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>The problem</h3>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.65 }}>
                Single AI tools are optimized to be agreeable. They tell you what you want to hear. Arena is built around the opposite principle — disagreement produces better answers.
              </p>
            </div>

            <div style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ fontSize: '32px', fontWeight: 500, color: '#C4956A', marginBottom: '.8rem' }}>02</div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>The approach</h3>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.65 }}>
                Leading models are matched to persona styles. The minds do not coordinate — they compete. A scorer ranks them. You can debate, focus on one mind, or open Agent Mode for long-form research.
              </p>
            </div>

            <div style={{ background: '#1A1714', borderRadius: '16px', padding: '1.5rem' }}>
              <div style={{ fontSize: '32px', fontWeight: 500, color: 'rgba(250,247,244,0.15)', marginBottom: '.8rem' }}>03</div>
              <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FAF7F4', marginBottom: '.5rem' }}>What ships today</h3>
              <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.6)', lineHeight: 1.65 }}>
                Arena panel, debate, focus chat, 16 personas, Watchlist (recurring research), Saved takes, Rooms (collaboration), and Agent Mode (plan through judge) are live — with calibration so Arena learns how you evaluate answers. Local computer agency stays with Condura — free, on your machine — not a cloud desktop or browser shim.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <p style={{ fontSize: '16px', color: '#6B6460', marginBottom: '1rem' }}>Arena is live and free to try.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              className="arena-btn arena-btn--primary arena-btn--md"
              onClick={goArena}
            >
              Try Arena →
            </button>
            <button
              type="button"
              className="arena-btn arena-btn--secondary arena-btn--md"
              onClick={() => navigate('/product')}
            >
              How it works
            </button>
            <button
              type="button"
              className="arena-btn arena-btn--ghost arena-btn--md"
              onClick={() => navigate('/pricing')}
            >
              Pricing
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
