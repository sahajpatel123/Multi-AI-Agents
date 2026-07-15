import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div style={{ background: '#F5F0E8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main
        style={{
          flex: 1,
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
          padding: '64px 24px',
          textAlign: 'center',
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
          404
        </p>
        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 36px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: '#1A1714',
            margin: '0 0 12px',
          }}
        >
          This page isn&apos;t in the arena
        </h1>
        <p style={{ fontSize: 15, color: '#6B6460', lineHeight: 1.65, margin: '0 0 28px' }}>
          The link may be old, mistyped, or the take was never shared. Head back to something real.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
          <button
            type="button"
            className="arena-btn arena-btn--primary arena-btn--md arena-btn--full"
            onClick={() => navigate('/')}
          >
            Back to home
          </button>
          <button
            type="button"
            className="arena-btn arena-btn--secondary arena-btn--md arena-btn--full"
            onClick={() => {
              if (isAuthenticated) {
                navigate('/app');
                return;
              }
              setRedirectIntent('/app');
              navigate('/signin');
            }}
          >
            {isAuthenticated ? 'Open Arena' : 'Try Arena'} →
          </button>
          <button
            type="button"
            className="arena-btn arena-btn--ghost arena-btn--md arena-btn--full"
            onClick={() => navigate(isAuthenticated ? '/agent' : '/product')}
          >
            {isAuthenticated ? 'Agent Mode' : 'How it works'}
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
