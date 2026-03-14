import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const SECTIONS = [
  {
    title: 'What We Collect',
    body: 'Arena collects your email address and hashed password when you create an account. We store your prompt history and session data to power the history and leaderboard features.',
  },
  {
    title: 'What We Do Not Collect',
    body: 'We do not collect payment information, location data, or any personally identifiable information beyond your email. We do not track you across other websites.',
  },
  {
    title: 'How We Use Your Data',
    body: 'Your data is used solely to provide the Arena service — session history, leaderboard tracking, and account authentication. Nothing else.',
  },
  {
    title: 'Data Storage',
    body: 'Data is stored in a secured SQLite database. Passwords are hashed using bcrypt and never stored in plain text.',
  },
  {
    title: 'Third Parties',
    body: "Arena uses the Anthropic Claude API to generate responses. Your prompts are sent to Anthropic's API for processing. Please review Anthropic's privacy policy for details on how they handle data.",
  },
  {
    title: 'Data Deletion',
    body: 'You can request deletion of your account and all associated data at any time by contacting us via GitHub.',
  },
  {
    title: 'Contact',
    body: 'For privacy concerns, reach out via the GitHub repository or LinkedIn.',
  },
];

export function PrivacyPage() {
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
        <div className="animate-fade-up" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>Legal</p>
          <h1 style={{ fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '.8rem' }}>Privacy Policy</h1>
          <p style={{ fontSize: '12px', color: '#6B6460' }}>Last updated: March 2026</p>
        </div>

        {/* Content */}
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
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
