import { useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';
import { formatAttemptedPath, notFoundActions } from '../lib/notFoundRecovery';

export function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const attempted = formatAttemptedPath(location.pathname, location.search);
  const actions = notFoundActions(isAuthenticated);

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
        <p style={{ fontSize: 15, color: '#6B6460', lineHeight: 1.65, margin: '0 0 12px' }}>
          The link may be old, mistyped, or the take was never shared. Head back to something real.
        </p>
        {attempted ? (
          <p
            style={{
              fontSize: 12,
              color: '#A89070',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              margin: '0 0 28px',
              wordBreak: 'break-all',
            }}
          >
            Requested: {attempted}
          </p>
        ) : (
          <div style={{ marginBottom: 28 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
          {actions.map((action) => {
            const className =
              action.variant === 'primary'
                ? 'arena-btn arena-btn--primary arena-btn--md arena-btn--full'
                : action.variant === 'secondary'
                  ? 'arena-btn arena-btn--secondary arena-btn--md arena-btn--full'
                  : 'arena-btn arena-btn--ghost arena-btn--md arena-btn--full';
            return (
              <button
                key={action.id}
                type="button"
                className={className}
                onClick={() => {
                  if (action.requiresAuth && !isAuthenticated) {
                    setRedirectIntent(action.path);
                    navigate('/signin');
                    return;
                  }
                  navigate(action.path);
                }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
