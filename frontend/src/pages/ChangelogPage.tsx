import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const CHANGELOG_ENTRIES = [
  {
    date: 'March 2026',
    version: 'v0.5',
    title: 'Share, Save and Action Row',
    body: 'Added Copy, Like, Dislike, Share and Save buttons below every agent response. Share to X, WhatsApp, or email directly from the card.',
    tags: ['Feature', 'UI'],
  },
  {
    date: 'March 2026',
    version: 'v0.4',
    title: 'Agent Leaderboard',
    body: 'Track which agent wins most across your sessions. Animated bars, win counts, and percentage breakdowns per agent.',
    tags: ['Feature', 'Analytics'],
  },
  {
    date: 'March 2026',
    version: 'v0.3',
    title: 'Sidebar Filters and History',
    body: 'Prompt history now filterable by category. Rename and delete history entries. Saved responses section added.',
    tags: ['Feature', 'UX'],
  },
  {
    date: 'March 2026',
    version: 'v0.2',
    title: 'Auth, Memory and Debate Mode',
    body: 'User authentication with JWT. Short and long-term memory system. Debate mode and 1-on-1 focused chat with any agent.',
    tags: ['Feature', 'Backend'],
  },
  {
    date: 'February 2026',
    version: 'v0.1',
    title: 'Arena Launched',
    body: 'Four AI agents. One prompt. Parallel responses, scoring by a fifth AI, winner surfaces automatically. The beginning.',
    tags: ['Launch'],
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
        {/* Hero */}
        <div className="animate-fade-up" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>What's new</p>
          <h1 style={{ fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '1rem' }}>Changelog</h1>
          <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '3rem' }}>Every update, improvement, and fix — documented.</p>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: '4px', top: 0, bottom: 0, width: '1px', background: '#E0D8D0' }} />

          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <div key={idx} style={{ position: 'relative', marginBottom: '2.5rem' }}>
              {/* Date dot */}
              <div style={{ position: 'absolute', left: '-2rem', top: '8px', width: '8px', height: '8px', borderRadius: '50%', background: '#C4956A' }} className="breathe" />

              {/* Content */}
              <div>
                <p style={{ fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '.4rem' }}>{entry.date}</p>
                <div style={{ background: '#F0EBE3', color: '#1A1714', fontSize: '11px', padding: '3px 10px', borderRadius: '999px', display: 'inline-block', marginBottom: '.8rem' }}>{entry.version}</div>

                <div style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '14px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>{entry.title}</h3>
                  <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.65, marginBottom: '1rem' }}>{entry.body}</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {entry.tags.map((tag) => (
                      <span key={tag} style={{ background: '#F0EBE3', color: '#6B6460', fontSize: '11px', padding: '3px 10px', borderRadius: '999px' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom text */}
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#6B6460', marginTop: '3rem' }}>More updates coming soon.</p>
      </div>

      <Footer />
    </div>
  );
}
