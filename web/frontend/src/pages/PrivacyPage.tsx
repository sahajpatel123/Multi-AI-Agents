import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const SECTIONS = [
  {
    title: 'What We Collect',
    body: 'Arena collects your email address and hashed password when you create an account. We store your prompt history, session data, and subscription status metadata (plan tier, billing period, and payment-provider identifiers) needed to power history, leaderboard, and billing features.',
  },
  {
    title: 'What We Do Not Collect',
    body: 'We do not collect location data or track you across other websites. We do not store your full card numbers or bank credentials on Arena servers — payment card details are handled by our payment processor (Razorpay) when you subscribe.',
  },
  {
    title: 'How We Use Your Data',
    body: 'Your data is used to provide the Arena service — authentication, session history, leaderboard tracking, plan entitlements, and subscription management. We do not sell your personal data.',
  },
  {
    title: 'Data Storage',
    body: 'Production data is stored in a managed PostgreSQL database. Passwords are hashed using bcrypt and never stored in plain text.',
  },
  {
    title: 'Third Parties',
    body: 'Arena relies on trusted infrastructure and service providers to operate securely, including hosting, analytics, authentication support, and payment processing via Razorpay. We only share the minimum information required for those services to function. Razorpay processes payments under its own privacy policy (razorpay.com/privacy).',
  },
  {
    title: 'AI Model Providers',
    body: "Arena's minds are powered by a selection of leading AI models, each chosen to match the reasoning style of that specific persona. The AI providers we work with include Anthropic (Claude), OpenAI (GPT), xAI (Grok), and DeepSeek. Your prompts may be processed by any of these providers depending on which minds are in your active panel.\n\nEach provider has their own privacy policy and data handling practices. We encourage you to review the privacy policies of these providers if you have specific concerns about how your data is processed:\n\n· Anthropic: anthropic.com/privacy\n· OpenAI: openai.com/privacy\n· xAI: x.ai/privacy\n· DeepSeek: deepseek.com/privacy\n\nWe do not share your account information, email address, or any personally identifiable information with these providers. Only the text of your prompts is transmitted for the purpose of generating responses.",
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
        <div className="animate-fade-up legal-hero" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>Legal</p>
          <h1 style={{ fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '.8rem' }}>Privacy Policy</h1>
          <p style={{ fontSize: '12px', color: '#6B6460' }}>Last updated: July 2026</p>
        </div>

        {/* Content */}
        <div className="legal-content" style={{ maxWidth: '680px', margin: '0 auto' }}>
          {SECTIONS.map((section, idx) => (
            <div key={idx}>
              <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714', marginBottom: '.6rem', marginTop: idx === 0 ? 0 : '2.5rem' }}>
                {section.title}
              </h2>
              <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.8 }}>
                {section.body.split('\n').map((paragraph, paragraphIndex, paragraphs) => (
                  <span key={`${section.title}-${paragraphIndex}`}>
                    {paragraph}
                    {paragraphIndex < paragraphs.length - 1 ? (
                      <>
                        <br />
                        <br />
                      </>
                    ) : null}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
