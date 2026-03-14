import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const FAQS = [
  {
    question: 'Do I need to create an account?',
    answer: 'Yes. Arena requires a free account to access. Create one in seconds — no credit card needed.',
  },
  {
    question: 'What is Pro and when is it coming?',
    answer: "Pro unlocks unlimited questions and Agent mode. We're working on it — join the waitlist to get early access.",
  },
  {
    question: 'How does the scoring work?',
    answer: 'A fifth AI scores each response on directness, logical soundness, actionability, assumption risk, and novelty. The highest scorer wins.',
  },
  {
    question: 'Can I use Arena for free forever?',
    answer: 'Yes. The Registered tier is free permanently. We will always have a free tier.',
  },
];

export function PricingPage() {
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
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>Simple pricing</p>
          <h1 style={{ fontSize: '52px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '1rem' }}>
            Start <span style={{ color: '#C4956A', fontStyle: 'italic' }}>free.</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#6B6460', maxWidth: '380px', lineHeight: 1.75, marginBottom: '3rem' }}>
            No hidden fees. No credit card to get started. Upgrade when you need more.
          </p>
        </div>

        {/* Pricing Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '3rem', maxWidth: '720px', margin: '0 auto 3rem' }}>
          {/* Registered Card (Featured) */}
          <div style={{ border: '1px solid #C4956A', borderRadius: '20px', padding: '2rem', background: '#FFFFFF', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#C4956A', color: '#FAF7F4', fontSize: '10px', padding: '4px 14px', borderRadius: '999px' }}>Most popular</div>

            <p style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '.8rem' }}>Registered</p>
            <div style={{ fontSize: '42px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1 }}>Free</div>
            <p style={{ fontSize: '13px', color: '#C4956A', marginBottom: '1.5rem' }}>with account</p>

            <div style={{ height: '0.5px', background: '#E0D8D0', marginBottom: '1.5rem' }} />

            <div style={{ flex: 1 }}>
              {['10 questions per day', 'All 16 personas', 'Full session history', 'Saved responses', 'Agent leaderboard', 'Priority access to new features'].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.6rem' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#C4B8AE', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#6B6460' }}>{feature}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate('/app')}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '999px',
                background: '#1A1714',
                color: '#FAF7F4',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '1.5rem',
                transition: 'opacity 150ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Create account
            </button>
          </div>

          {/* Pro Card */}
          <div style={{ border: '0.5px solid #E0D8D0', borderRadius: '20px', padding: '2rem', background: '#1A1714', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(250,247,244,0.5)', marginBottom: '.8rem' }}>Pro</p>
            <div style={{ fontSize: '42px', fontWeight: 500, letterSpacing: '-.03em', color: '#FAF7F4', lineHeight: 1 }}>Coming</div>
            <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.4)', marginBottom: '1.5rem' }}>soon</p>

            <div style={{ height: '0.5px', background: 'rgba(250,247,244,0.1)', marginBottom: '1.5rem' }} />

            <div style={{ flex: 1 }}>
              {['Unlimited questions', 'Agent mode access', 'Priority support', 'Early feature access'].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.6rem' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(250,247,244,0.2)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'rgba(250,247,244,0.6)' }}>{feature}</span>
                </div>
              ))}
            </div>

            <button
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '999px',
                border: '0.5px solid rgba(250,247,244,0.2)',
                color: 'rgba(250,247,244,0.6)',
                background: 'transparent',
                fontSize: '13px',
                cursor: 'not-allowed',
                marginTop: '1.5rem',
              }}
            >
              Join waitlist
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        <div style={{ marginTop: '3rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#1A1714', marginBottom: '1.5rem' }}>Common questions</h2>

          {FAQS.map((faq, idx) => (
            <div key={idx} style={{ borderBottom: '0.5px solid #E0D8D0', padding: '1rem 0' }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', marginBottom: '.4rem' }}>{faq.question}</p>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.6 }}>{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
