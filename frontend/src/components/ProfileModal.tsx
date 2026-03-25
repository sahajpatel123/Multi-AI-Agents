import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  cancelSubscription,
  getSubscriptionStatus,
  getUserUsage,
  patchUserProfile,
  type SubscriptionStatusResponse,
  type UserUsageResponse,
} from '../api';
import { useProfileModal } from '../context/ProfileModalContext';
import { useAuth } from '../hooks/useAuth';
import MicroLoader from './MicroLoader';

const EXPERTISE_PILLS = [
  { id: 'none', label: 'None' },
  { id: 'curious', label: 'Curious' },
  { id: 'practitioner', label: 'Practitioner' },
  { id: 'expert', label: 'Expert' },
  { id: 'researcher', label: 'Researcher' },
] as const;

function profileInitials(name: string | undefined, email: string): string {
  const n = (name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0] || 'A';
  return local.slice(0, 2).toUpperCase();
}

function formatInrPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function TabIconAccount({ active }: { active: boolean }) {
  const c = active ? '#C4956A' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a5 5 0 100-10 5 5 0 000 10zM3 20a9 9 0 0118 0v1H3v-1z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconPlan({ active }: { active: boolean }) {
  const c = active ? '#C4956A' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11l2 2 4-4m-9 9h12a2 2 0 002-2V7a2 2 0 00-2-2H9l-4 4v8a2 2 0 002 2z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconUsage({ active }: { active: boolean }) {
  const c = active ? '#C4956A' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 16l4-4 4 4 8-8M4 20h16"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconHelp({ active }: { active: boolean }) {
  const c = active ? '#C4956A' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 18h.01M12 14a4 4 0 10-4-4 2 2 0 014 2c0 2-4 2-4 4"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PLACEHOLDER_HISTORY = [8, 14, 11, 19, 15, 22, 17, 12, 25, 18, 14, 21, 10, 28];

function UsageChart({
  data,
  isPlaceholder,
}: {
  data: number[];
  isPlaceholder: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 300);
    const h = 90;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const values = data.length >= 14 ? data.slice(-14) : [...data];
    while (values.length < 14) values.unshift(0);
    const slice = values.slice(-14);
    const max = Math.max(...slice, 1);
    const gap = 4;
    const barW = (w - 2 - gap * 13) / 14;
    let x = 1;
    slice.forEach((v, i) => {
      const bh = Math.max(2, (v / max) * (h - 8));
      const y = h - 4 - bh;
      ctx.fillStyle = isPlaceholder ? '#E8DDD0' : i === 13 ? '#C4956A' : '#E8DDD0';
      const r = 2;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barW, bh);
      }
      x += barW + gap;
    });
  }, [data, isPlaceholder]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 90, display: 'block' }} />;
}

function planFeatures(tier: string): string[] {
  const t = tier.toUpperCase();
  if (t === 'PRO') {
    return [
      '16 personas',
      '300K credits / day',
      'Agent Mode + pipeline',
      'Priority routing',
      'Full pipeline access',
      'Revision trace',
    ];
  }
  if (t === 'PLUS') {
    return ['16 personas', '100K credits / day', 'Arena + Debate Mode', 'Task memory'];
  }
  return ['6 personas', '25K credits / day', 'Arena Mode only', 'No memory'];
}

export function ProfileModal() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { isOpen, closing, origin, activeTab, setActiveTab, closeModal } = useProfileModal();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  const [fullName, setFullName] = useState('');
  const [expertiseLevel, setExpertiseLevel] = useState('curious');
  const [expertiseDomain, setExpertiseDomain] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const [usage, setUsage] = useState<UserUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageErr, setUsageErr] = useState<string | null>(null);

  const [sub, setSub] = useState<SubscriptionStatusResponse | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user) return;
    setFullName(user.name || '');
    setExpertiseLevel((user.expertise_level || 'curious').toLowerCase());
    setExpertiseDomain(user.expertise_domain || '');
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setUsageLoading(true);
    setUsageErr(null);
    void getUserUsage()
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        if (!cancelled) setUsageErr('Could not load usage');
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSubLoading(true);
    void getSubscriptionStatus()
      .then((s) => {
        if (!cancelled) setSub(s);
      })
      .catch(() => {
        if (!cancelled) setSub({ has_subscription: false, tier: 'FREE' });
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  const handleOverlayPointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeModal();
    },
    [closeModal],
  );

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaveBusy(true);
    setSaveOk(false);
    try {
      await patchUserProfile({
        name: fullName.trim(),
        expertise_level: expertiseLevel,
        expertise_domain: expertiseDomain.trim(),
      });
      localStorage.setItem('arena_expertise_level', expertiseLevel);
      localStorage.setItem('arena_expertise_domain', expertiseDomain.trim());
      await refreshUser();
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2000);
    } catch {
      // silent; could show error
    } finally {
      setSaveBusy(false);
    }
  };

  const handleSignOut = async () => {
    closeModal();
    await logout();
    navigate('/');
  };

  const handleManagePlan = () => {
    const tierUpper = (user?.tier || 'FREE').toUpperCase();
    const paid =
      sub?.has_subscription &&
      (tierUpper === 'PLUS' || tierUpper === 'PRO') &&
      sub?.status &&
      ['created', 'authenticated', 'active', 'halted'].includes(sub.status);

    closeModal(() => {
      if (!paid) {
        navigate('/pricing');
        return;
      }
      navigate('/pricing');
    });
  };

  const handleCancelSub = async () => {
    if (!sub?.razorpay_subscription_id) return;
    setCancelBusy(true);
    try {
      await cancelSubscription();
      const s = await getSubscriptionStatus();
      setSub(s);
      await refreshUser();
    } catch {
      // ignore
    } finally {
      setCancelBusy(false);
    }
  };

  if (!isOpen && !closing) return null;
  if (!user) return null;

  const tierUpper = (user.tier || 'FREE').toUpperCase();
  const planLabel =
    tierUpper === 'PRO' ? 'Arena Pro' : tierUpper === 'PLUS' ? 'Arena Plus' : 'Arena Free';
  const billingLine =
    sub?.has_subscription && sub.billing_period
      ? `${sub.billing_period === 'annual' ? 'ANNUAL' : 'MONTHLY'} SUBSCRIPTION · ${(sub.status || 'ACTIVE').toUpperCase()}`
      : 'FREE PLAN · NO BILLING';

  const mobile = isMobile;
  const panelAnim = closing
    ? origin === 'bottom-left'
      ? 'profileModalPanelCloseBL 0.22s ease-in forwards'
      : 'profileModalPanelCloseTR 0.22s ease-in forwards'
    : origin === 'bottom-left'
      ? 'profileModalPanelOpenBL 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      : 'profileModalPanelOpenTR 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards';

  const overlayAnim = closing ? 'profileModalOverlayOut 0.22s ease forwards' : 'profileModalOverlayIn 0.2s ease forwards';

  const tabs = (
    <>
      {(
        [
          { id: 'account' as const, label: 'Account', Icon: TabIconAccount },
          { id: 'plan' as const, label: 'Plan', Icon: TabIconPlan },
          { id: 'usage' as const, label: 'Usage', Icon: TabIconUsage },
          { id: 'help' as const, label: 'Get help', Icon: TabIconHelp },
        ] as const
      ).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveTab(id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 16px',
            fontSize: 13,
            color: activeTab === id ? '#2C1810' : '#6B5040',
            fontFamily: 'Georgia, serif',
            cursor: 'pointer',
            transition: 'background 0.12s, color 0.12s',
            border: 'none',
            borderRight: activeTab === id ? '2px solid #C4956A' : '2px solid transparent',
            background: activeTab === id ? '#E8DDD0' : 'transparent',
            fontWeight: activeTab === id ? 500 : 400,
            textAlign: 'left',
            width: mobile ? 'auto' : '100%',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (activeTab !== id) e.currentTarget.style.background = '#EDE4D8';
          }}
          onMouseLeave={(e) => {
            if (activeTab !== id) e.currentTarget.style.background = 'transparent';
          }}
        >
          <Icon active={activeTab === id} />
          {label}
        </button>
      ))}
    </>
  );

  const displayName = (user.name || '').trim() || user.email.split('@')[0];

  const content = (
    <div
      role="presentation"
      onMouseDown={handleOverlayPointerDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(30, 18, 10, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: overlayAnim,
      }}
    >
      <style>{`
        @keyframes profileModalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes profileModalOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes profileModalPanelOpenTR {
          from { opacity: 0; transform: scale(0.08) translate(60px, -60px); }
          to { opacity: 1; transform: scale(1) translate(0, 0); }
        }
        @keyframes profileModalPanelOpenBL {
          from { opacity: 0; transform: scale(0.08) translate(-60px, 60px); }
          to { opacity: 1; transform: scale(1) translate(0, 0); }
        }
        @keyframes profileModalPanelCloseTR {
          from { opacity: 1; transform: scale(1) translate(0, 0); }
          to { opacity: 0; transform: scale(0.08) translate(60px, -60px); }
        }
        @keyframes profileModalPanelCloseBL {
          from { opacity: 1; transform: scale(1) translate(0, 0); }
          to { opacity: 0; transform: scale(0.08) translate(-60px, 60px); }
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: mobile ? '100vw' : 680,
          maxWidth: mobile ? 'none' : 'calc(100vw - 32px)',
          height: mobile ? '100vh' : 540,
          maxHeight: mobile ? 'none' : 'calc(100vh - 48px)',
          background: '#FDFAF6',
          border: mobile ? 'none' : '0.5px solid #DDD0BC',
          borderRadius: mobile ? 0 : 14,
          display: 'flex',
          flexDirection: mobile ? 'column' : 'row',
          overflow: 'hidden',
          transformOrigin: origin === 'bottom-left' ? 'bottom left' : 'top right',
          animation: panelAnim,
        }}
      >
        <aside
          style={{
            width: mobile ? '100%' : 180,
            flexShrink: 0,
            background: '#F5EFE6',
            borderRight: mobile ? 'none' : '0.5px solid #E0D5C5',
            borderBottom: mobile ? '0.5px solid #E0D5C5' : 'none',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            maxHeight: mobile ? 'auto' : undefined,
          }}
        >
          <div style={{ padding: '18px 16px 16px', borderBottom: '0.5px solid #E0D5C5' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#C4956A',
                color: '#FAF7F2',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {profileInitials(user.name, user.email)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#2C1810', fontFamily: 'Georgia, serif', marginTop: 8 }}>
              {displayName}
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#C4956A',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {tierUpper === 'PRO' ? 'Pro' : tierUpper === 'PLUS' ? 'Plus' : 'Free'}
              {sub?.billing_period ? ` · ${sub.billing_period === 'annual' ? 'Annual' : 'Monthly'}` : ''}
            </div>
          </div>
          <nav
            style={{
              display: 'flex',
              flexDirection: mobile ? 'row' : 'column',
              marginTop: mobile ? 0 : 4,
              overflowX: mobile ? 'auto' : 'visible',
              flex: mobile ? undefined : 1,
            }}
          >
            {tabs}
          </nav>
          <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '0.5px solid #E0D5C5' }}>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                color: '#8C7355',
                cursor: 'pointer',
                fontFamily: 'Georgia, serif',
                background: 'none',
                border: 'none',
                padding: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#C4956A')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8C7355')}
            >
              <IconSignOut />
              Sign out
            </button>
          </div>
        </aside>

        <div style={{ flex: 1, padding: mobile ? '20px 18px' : '28px 30px', overflowY: 'auto' }}>
          <div style={{ display: activeTab === 'account' ? 'block' : 'none' }}>
            <h2 id="profile-modal-title" style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>
              Account
            </h2>
            <p style={{ fontSize: 12, color: '#A89070', marginBottom: 24 }}>Manage your profile and expertise calibration</p>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#A89070', marginBottom: 6 }}>Full name</div>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{
                  width: '100%',
                  border: '0.5px solid #DDD0BC',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: '#2C1810',
                  background: '#FDFAF6',
                  fontFamily: 'Georgia, serif',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#C4956A')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#DDD0BC')}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#A89070', marginBottom: 6 }}>
                Email address
              </div>
              <input
                value={user.email}
                disabled
                style={{
                  width: '100%',
                  border: '0.5px solid #DDD0BC',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: '#8C7355',
                  background: '#EDE4D8',
                  fontFamily: 'Georgia, serif',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#A89070', marginBottom: 6 }}>Password</div>
              <input
                type="password"
                value="••••••••••"
                readOnly
                placeholder="Change password"
                style={{
                  width: '100%',
                  border: '0.5px solid #DDD0BC',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: '#2C1810',
                  background: '#FDFAF6',
                  fontFamily: 'Georgia, serif',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ borderTop: '0.5px solid #EDE4D8', margin: '20px 0' }} />

            <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#A89070', marginBottom: 6 }}>
              Your expertise background
            </div>
            <p style={{ fontSize: 12, color: '#A89070', margin: '4px 0 10px' }}>
              Arena calibrates response depth and terminology to match your background across all tasks.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {EXPERTISE_PILLS.map((p) => {
                const sel = expertiseLevel === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setExpertiseLevel(p.id)}
                    style={{
                      fontSize: 11,
                      padding: '4px 13px',
                      borderRadius: 12,
                      border: sel ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                      color: sel ? '#FAF7F2' : '#8C7355',
                      background: sel ? '#C4956A' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {expertiseLevel !== 'none' ? (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#A89070', marginBottom: 6 }}>
                  Your domain
                </div>
                <input
                  value={expertiseDomain}
                  onChange={(e) => setExpertiseDomain(e.target.value)}
                  placeholder="e.g. cardiology, ML research, corporate law..."
                  style={{
                    width: '100%',
                    border: '0.5px solid #DDD0BC',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#2C1810',
                    background: '#FDFAF6',
                    fontFamily: 'Georgia, serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#C4956A')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#DDD0BC')}
                />
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void handleSaveProfile()}
                style={{
                  padding: '9px 22px',
                  background: '#2C1810',
                  color: '#C4956A',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 6,
                  cursor: saveBusy ? 'default' : 'pointer',
                  fontFamily: 'Georgia, serif',
                  letterSpacing: '0.05em',
                  opacity: saveBusy ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!saveBusy) e.currentTarget.style.background = '#3D2820';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2C1810';
                }}
              >
                Save changes
              </button>
              {saveOk ? <span style={{ fontSize: 12, color: '#8C7355' }}>Saved</span> : null}
            </div>
          </div>

          <div style={{ display: activeTab === 'plan' ? 'block' : 'none' }}>
            <h2 style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>Your plan</h2>
            <p style={{ fontSize: 12, color: '#A89070', marginBottom: 16 }}>Current subscription and billing details</p>
            {subLoading ? (
              <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
                <MicroLoader />
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: '#2C1810',
                    borderRadius: 10,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 24, color: '#C4956A', fontWeight: 600, letterSpacing: '0.03em', fontFamily: 'Georgia, serif' }}>{planLabel}</div>
                  <div style={{ fontSize: 11, color: '#6B5040', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 3 }}>{billingLine}</div>
                  <div style={{ borderTop: '0.5px solid #3D2820', margin: '14px 0' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    {planFeatures(user.tier).map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#A89070' }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#C4956A', flexShrink: 0 }} />
                        {f}
                      </div>
                    ))}
                  </div>
                  {sub?.has_subscription && tierUpper !== 'FREE' && tierUpper !== 'GUEST' ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B5040' }}>Next billing date</div>
                        <div style={{ fontSize: 13, color: '#C4956A', fontWeight: 500 }}>
                          {sub.amount != null ? `${formatInrPaise(sub.amount)} · ` : ''}
                          {sub.current_end ? new Date(sub.current_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#6B5040' }}>Per month</div>
                        <div style={{ fontSize: 13, color: '#C4956A', fontWeight: 500 }}>
                          {sub.amount != null && sub.billing_period === 'annual'
                            ? formatInrPaise(Math.round(sub.amount / 12))
                            : sub.amount != null
                              ? formatInrPaise(sub.amount)
                              : '—'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleManagePlan}
                  style={{
                    width: '100%',
                    padding: 9,
                    border: '0.5px solid #C4956A',
                    borderRadius: 6,
                    background: 'transparent',
                    color: '#C4956A',
                    fontSize: 12,
                    fontFamily: 'Georgia, serif',
                    cursor: 'pointer',
                    marginBottom: 8,
                  }}
                >
                  {tierUpper === 'FREE' || tierUpper === 'GUEST' ? 'Upgrade plan' : 'Manage subscription'}
                </button>
                {sub?.has_subscription && sub.razorpay_subscription_id && ['created', 'authenticated', 'active', 'halted'].includes(sub.status || '') ? (
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={() => void handleCancelSub()}
                    style={{
                      width: '100%',
                      padding: 8,
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 6,
                      background: 'transparent',
                      color: '#8C7355',
                      fontSize: 11,
                      fontFamily: 'Georgia, serif',
                      cursor: cancelBusy ? 'default' : 'pointer',
                    }}
                  >
                    {cancelBusy ? 'Cancelling…' : 'Cancel subscription'}
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div style={{ display: activeTab === 'usage' ? 'block' : 'none' }}>
            <h2 style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>Usage</h2>
            <p style={{ fontSize: 12, color: '#A89070', marginBottom: 16 }}>Your activity across Arena and Agent Mode</p>
            {usageLoading ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <MicroLoader />
              </div>
            ) : usageErr || !usage ? (
              <p style={{ fontSize: 13, color: '#8C7355' }}>{usageErr || 'No data'}</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { n: usage.credits_remaining_today, l: 'Today remaining' },
                    { n: usage.credits_remaining_week, l: 'Week remaining' },
                    { n: usage.total_tasks_month, l: 'Tasks this month' },
                  ].map((t) => (
                    <div key={t.l} style={{ background: '#F0E8DC', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 20, color: '#2C1810', fontWeight: 500, fontFamily: 'Georgia, serif' }}>{t.n.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: '#A89070', marginTop: 3, letterSpacing: '0.04em' }}>{t.l}</div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const dailyPct = usage.daily_limit > 0 ? (usage.credits_used_today / usage.daily_limit) * 100 : 0;
                  const weeklyPct = usage.weekly_limit > 0 ? (usage.credits_used_week / usage.weekly_limit) * 100 : 0;
                  const dailyFill = dailyPct > 85 ? '#C0392B' : '#C4956A';
                  const weekFill = weeklyPct > 85 ? '#C0392B' : '#C4956A';
                  return (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8C7355' }}>Daily limit</span>
                          <span style={{ color: '#A89070' }}>
                            {usage.credits_used_today.toLocaleString()} / {usage.daily_limit.toLocaleString()} used
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#EDE4D8', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${Math.min(dailyPct, 100)}%`, background: dailyFill, borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8C7355' }}>Weekly limit</span>
                          <span style={{ color: '#A89070' }}>
                            {usage.credits_used_week.toLocaleString()} / {usage.weekly_limit.toLocaleString()} used
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#EDE4D8', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${Math.min(weeklyPct, 100)}%`, background: weekFill, borderRadius: 3 }} />
                        </div>
                      </div>
                    </>
                  );
                })()}
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#A89070', letterSpacing: '0.10em', margin: '16px 0 8px' }}>14-day activity</div>
                <UsageChart
                  data={usage.usage_history && usage.usage_history.length === 14 ? usage.usage_history : PLACEHOLDER_HISTORY}
                  isPlaceholder={!usage.usage_history || usage.usage_history.length !== 14}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Georgia, serif', marginTop: 6 }}>
                  <span style={{ color: '#C4A882' }}>14 days ago</span>
                  <span style={{ color: '#C4A882' }}>Today</span>
                </div>
              </>
            )}
          </div>

          <div style={{ display: activeTab === 'help' ? 'block' : 'none' }}>
            <h2 style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>Get help</h2>
            <p style={{ fontSize: 12, color: '#A89070', marginBottom: 8 }}>Resources, legal, and support</p>
            {(
              [
                {
                  title: 'About Arena',
                  desc: 'Our story, mission and team',
                  onClick: () => closeModal(() => navigate('/about')),
                },
                {
                  title: 'Privacy policy',
                  desc: 'How we handle your data',
                  onClick: () => closeModal(() => navigate('/privacy')),
                },
                {
                  title: 'Terms of service',
                  desc: 'Usage terms and conditions',
                  onClick: () => closeModal(() => navigate('/terms')),
                },
                {
                  title: 'Contact support',
                  desc: 'Get in touch with our team',
                  onClick: () => {
                    window.location.href = 'mailto:support@arena.com';
                  },
                },
              ] as const
            ).map((row, idx, arr) => (
              <button
                key={row.title}
                type="button"
                onClick={row.onClick}
                onMouseEnter={(e) => {
                  const t = e.currentTarget.querySelector('.profile-help-title') as HTMLElement | null;
                  if (t) t.style.color = '#C4956A';
                }}
                onMouseLeave={(e) => {
                  const t = e.currentTarget.querySelector('.profile-help-title') as HTMLElement | null;
                  if (t) t.style.color = '#4A3728';
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '13px 0',
                  borderBottom: idx === arr.length - 1 ? 'none' : '0.5px solid #EDE4D8',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  textAlign: 'left',
                  transition: 'color 0.15s',
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 13, color: '#4A3728', fontFamily: 'Georgia, serif' }}
                    className="profile-help-title"
                  >
                    {row.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#A89070', marginTop: 2 }}>{row.desc}</div>
                </div>
                <span style={{ color: '#C4A882', fontSize: 12 }}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
