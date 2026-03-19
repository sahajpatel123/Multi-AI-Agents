import { Lock, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitle?: string;
}

const featureItems = [
  'Debate mode — challenge any mind',
  'All 16 personas unlocked',
  'Memory across sessions',
];

export function UpgradeModal({
  isOpen,
  onClose,
  subtitle = 'Debate mode lets you challenge any mind and watch the others react in real time.',
}: UpgradeModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div
      className="upgrade-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(26,23,20,0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="upgrade-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FAF7F4',
          borderRadius: '20px',
          padding: '2.5rem',
          maxWidth: '420px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 32px 80px rgba(26,23,20,0.18)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            color: '#C4956A',
            margin: '0 auto 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Lock style={{ width: '32px', height: '32px' }} />
        </div>
        <h2
          style={{
            fontSize: '22px',
            fontWeight: 500,
            letterSpacing: '-.02em',
            marginBottom: '.5rem',
            color: '#1A1714',
          }}
        >
          This is a Plus feature
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: '#6B6460',
            lineHeight: 1.7,
            marginBottom: '2rem',
          }}
        >
          {subtitle}
        </p>

        <div style={{ textAlign: 'left' }}>
          {featureItems.map((item) => (
            <div
              key={item}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                fontSize: '13px',
                color: '#1A1714',
                marginBottom: '.5rem',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#C4956A',
                  color: '#FAF7F4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Check style={{ width: '10px', height: '10px' }} />
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate('/pricing')}
          style={{
            width: '100%',
            padding: '13px 24px',
            borderRadius: '999px',
            background: '#1A1714',
            color: '#FAF7F4',
            fontSize: '14px',
            marginTop: '1.5rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Upgrade to Plus — $12/month
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: '13px',
            color: '#6B6460',
            cursor: 'pointer',
            marginTop: '.8rem',
            background: 'transparent',
            border: 'none',
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
