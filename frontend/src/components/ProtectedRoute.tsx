import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AgentDot } from './AgentDot';

interface ProtectedRouteProps {
  children: ReactNode;
}

const AGENTS = [
  { id: 'agent_1', name: 'The Analyst', color: '#8C9BAB' },
  { id: 'agent_2', name: 'The Philosopher', color: '#9B8FAA' },
  { id: 'agent_3', name: 'The Pragmatist', color: '#8AA899' },
  { id: 'agent_4', name: 'The Contrarian', color: '#B0977E' },
];

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', '/app');
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          background: '#FAF7F4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <style>{`
          @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.5); opacity: 0.6; }
          }
        `}</style>
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#C4956A',
            animation: 'breathe 1.5s ease-in-out infinite',
          }}
        />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAF7F4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '2rem 1rem',
      }}
    >
      <style>{`
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-25px, 25px) scale(0.95); }
          66% { transform: translate(20px, -20px) scale(1.05); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Ambient Orbs */}
      <div
        style={{
          position: 'fixed',
          top: '-300px',
          left: '-300px',
          width: '600px',
          height: '600px',
          background: 'rgba(196,149,106,0.05)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'floatOrb1 18s ease-in-out infinite alternate',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: '-250px',
          right: '-250px',
          width: '500px',
          height: '500px',
          background: 'rgba(138,168,153,0.04)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'floatOrb2 22s ease-in-out infinite alternate',
        }}
      />

      {/* Giant decorative "4" */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '280px',
          fontWeight: 500,
          color: '#F0EBE3',
          pointerEvents: 'none',
          zIndex: 0,
          letterSpacing: '-0.06em',
          userSelect: 'none',
        }}
      >
        4
      </div>

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Arena wordmark */}
        <div
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            marginBottom: '3rem',
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 500ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#C4956A',
              animation: 'breathe 2.4s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
        </div>

        {/* Eyebrow */}
        <p
          style={{
            fontSize: '11px',
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: '#6B6460',
            marginBottom: '1rem',
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 500ms cubic-bezier(0.16,1,0.3,1) 100ms',
          }}
        >
          Members only
        </p>

        {/* Headline */}
        <h1
          style={{
            fontSize: '38px',
            fontWeight: 500,
            letterSpacing: '-.03em',
            lineHeight: 1.1,
            color: '#1A1714',
            marginBottom: '1rem',
          }}
        >
          <span
            style={{
              display: 'block',
              opacity: showContent ? 1 : 0,
              transform: showContent ? 'translateY(0)' : 'translateY(16px)',
              transition: 'all 500ms cubic-bezier(0.16,1,0.3,1) 150ms',
            }}
          >
            This is where the
          </span>
          <span
            style={{
              display: 'block',
              color: '#C4956A',
              fontStyle: 'italic',
              opacity: showContent ? 1 : 0,
              transform: showContent ? 'translateY(0)' : 'translateY(16px)',
              transition: 'all 500ms cubic-bezier(0.16,1,0.3,1) 250ms',
            }}
          >
            debate happens.
          </span>
        </h1>

        {/* Subtext */}
        <p
          style={{
            fontSize: '14px',
            color: '#6B6460',
            lineHeight: 1.75,
            marginBottom: '2rem',
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 500ms cubic-bezier(0.16,1,0.3,1) 350ms',
          }}
        >
          Create a free account to access Arena — four AI minds competing to give you the most honest answer.
        </p>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '0.8rem',
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 500ms cubic-bezier(0.16,1,0.3,1) 450ms',
          }}
        >
          <button
            onClick={() => navigate('/signin')}
            style={{
              width: '100%',
              padding: '13px 24px',
              borderRadius: '999px',
              background: '#1A1714',
              color: '#FAF7F4',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Create free account
          </button>

          <button
            onClick={() => navigate('/signin')}
            style={{
              width: '100%',
              padding: '13px 24px',
              borderRadius: '999px',
              background: 'transparent',
              color: '#6B6460',
              fontSize: '14px',
              fontWeight: 500,
              border: '0.5px solid #E0D8D0',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F0EBE3';
              e.currentTarget.style.borderColor = '#C4B8AE';
              e.currentTarget.style.color = '#1A1714';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#E0D8D0';
              e.currentTarget.style.color = '#6B6460';
            }}
          >
            Sign in
          </button>
        </div>

        {/* No credit card text */}
        <p
          style={{
            fontSize: '12px',
            color: '#6B6460',
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 500ms cubic-bezier(0.16,1,0.3,1) 450ms',
          }}
        >
          No credit card required.
        </p>
      </div>

      {/* Agent Pills at Bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {AGENTS.map((agent, idx) => (
          <div
            key={agent.id}
            style={{
              background: '#F0EBE3',
              border: '0.5px solid #E0D8D0',
              borderRadius: '999px',
              padding: '5px 12px',
              fontSize: '11px',
              color: '#6B6460',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              opacity: showContent ? 1 : 0,
              transform: showContent ? 'translateY(0)' : 'translateY(16px)',
              transition: `all 500ms cubic-bezier(0.16,1,0.3,1) ${500 + idx * 60}ms`,
            }}
          >
            <AgentDot agentId={agent.id} size={5} />
            {agent.name}
          </div>
        ))}
      </div>
    </div>
  );
}
