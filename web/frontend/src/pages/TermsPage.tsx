import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    body: 'By accessing Arena, you agree to these terms. If you do not agree, please do not use the service.',
  },
  {
    title: 'Use of Service',
    body: 'Arena is provided for personal and informational use. You may not use Arena to generate harmful, illegal, or malicious content. We reserve the right to suspend accounts that violate these terms.',
  },
  {
    title: 'User Accounts',
    body: 'You are responsible for maintaining the security of your account. Arena stores minimal user data — email, hashed password, and session history. We do not sell your data.',
  },
  {
    title: 'Intellectual Property',
    body: "Arena's interface, design, and underlying architecture are the property of the creator. AI-generated responses belong to no one — use them freely.",
  },
  {
    title: 'Limitation of Liability',
    body: 'Arena is provided as-is. We make no guarantees about the accuracy of AI-generated responses. Use your own judgment when acting on any response.',
  },
  {
    title: 'Changes to Terms',
    body: 'We may update these terms at any time. Continued use of Arena after changes constitutes acceptance of the new terms.',
  },
  {
    title: 'Contact',
    body: 'Questions? Reach out via the GitHub repository or LinkedIn.',
  },
];

export function TermsPage() {
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
        .breathe-slow { animation: breathe 3.2s ease-in-out infinite; }
        .animate-fade-up { animation: fadeUp 500ms ease 100ms backwards; }
      `}</style>

      <Navbar />

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '64px 24px' }}>
        {/* Hero */}
        <div className="animate-fade-up legal-hero" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>Legal</p>
          <h1 style={{ fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '.8rem' }}>Terms of Service</h1>
          <p style={{ fontSize: '12px', color: '#6B6460' }}>Last updated: March 2026</p>
        </div>

        {/* Content */}
        <div className="legal-content" style={{ maxWidth: '680px', margin: '0 auto' }}>
          {SECTIONS.map((section, idx) => (
            <div key={idx}>
              <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714', marginBottom: '.6rem', marginTop: idx === 0 ? 0 : '2.5rem' }}>
                {section.title}
              </h2>
              <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
