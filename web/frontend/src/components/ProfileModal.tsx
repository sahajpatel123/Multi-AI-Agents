import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  cancelAgentAddon,
  cancelSubscription,
  deleteMcpIntegration,
  getCalibrationStats,
  getMcpIntegrations,
  getRecentAgentFeedback,
  getSubscriptionStatus,
  getUserAnswerFeedbackStats,
  getUserUsage,
  patchUserProfile,
  postMcpManualConnect,
  reactivateAgentAddon,
  type AnswerFeedbackStats,
  type RecentFeedbackItem,
  type SubscriptionStatusResponse,
  type UserUsageResponse,
} from '../api';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { useAuth } from '../hooks/useAuth';
import { Button } from './Button';
import { getBrandIcon, PlugIcon } from './BrandIcons';
import { Icons } from './Icons';
import { SERVICES } from './integrationServices';
import MicroLoader from './MicroLoader';
import { RazorpayCheckout } from './RazorpayCheckout';
import { ExpertiseSelector } from './ExpertiseSelector';
import {
  domainForExpertiseLevel,
  normalizeExpertiseLevel,
} from '../lib/expertiseSelector';
import {
  PROFILE_NAME_MAX,
  profileSaveCaughtErrorMessage,
  profileSaveIssueMessage,
  validateProfileName,
} from '../lib/profileSave';
import { motionDuration } from '../lib/motion';

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

function formatRelativeConnected(iso: string | null): string {
  if (!iso) return 'recently';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
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

function TabIconIntegrations({ active }: { active: boolean }) {
  const c = active ? '#C4956A' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22v-5M9 8a3 3 0 116 0c0 2-3 3-3 3M12 17h.01"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12H5a2 2 0 01-2-2V5a2 2 0 012-2h3m8 9h3a2 2 0 002-2V5a2 2 0 00-2-2h-3"
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
  const { refreshTier } = useTier();
  const { isOpen, closing, origin, activeTab, setActiveTab, closeModal } = useProfileModal();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  const [fullName, setFullName] = useState('');
  const [expertiseLevel, setExpertiseLevel] = useState('curious');
  const [expertiseDomain, setExpertiseDomain] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorRef = useRef<HTMLParagraphElement | null>(null);
  const saveOkTimerRef = useRef<number | null>(null);

  const [usage, setUsage] = useState<UserUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageErr, setUsageErr] = useState<string | null>(null);
  const [calStats, setCalStats] = useState<{
    total_ratings?: number;
    avg_delta?: number;
    trend?: string;
    calibration_score?: number;
    recent_ratings?: Array<{ delta?: number; created_at?: string }>;
  } | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [fbAcc, setFbAcc] = useState<AnswerFeedbackStats | null>(null);
  const [fbAccLoading, setFbAccLoading] = useState(false);
  const [fbAccErr, setFbAccErr] = useState<string | null>(null);
  const [recentFb, setRecentFb] = useState<RecentFeedbackItem[]>([]);
  const [recentFbLoading, setRecentFbLoading] = useState(false);
  const [recentFbErr, setRecentFbErr] = useState<string | null>(null);

  const [sub, setSub] = useState<SubscriptionStatusResponse | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [addonCheckout, setAddonCheckout] = useState(false);
  const [addonCancelConfirm, setAddonCancelConfirm] = useState(false);
  const [addonBusy, setAddonBusy] = useState(false);

  const [mcpList, setMcpList] = useState<any[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpErr, setMcpErr] = useState<string | null>(null);
  const [mcpExpandedId, setMcpExpandedId] = useState<string | null>(null);
  const [mcpTokenInputs, setMcpTokenInputs] = useState<Record<string, string>>({});
  const [mcpConnectBusy, setMcpConnectBusy] = useState<string | null>(null);
  const [mcpToast, setMcpToast] = useState<string | null>(null);
  const [mcpDisconnectTarget, setMcpDisconnectTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

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
    setExpertiseLevel(normalizeExpertiseLevel(user.expertise_level));
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
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setCalLoading(true);
    setCalErr(null);
    void getCalibrationStats()
      .then((raw) => {
        if (!cancelled) setCalStats(raw as typeof calStats);
      })
      .catch(() => {
        if (!cancelled) {
          setCalErr('Could not load calibration');
          setCalStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setFbAccLoading(true);
    setFbAccErr(null);
    void getUserAnswerFeedbackStats()
      .then((s) => {
        if (!cancelled) setFbAcc(s);
      })
      .catch(() => {
        if (!cancelled) {
          setFbAccErr('Could not load feedback accuracy');
          setFbAcc(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFbAccLoading(false);
      });
    setRecentFbLoading(true);
    setRecentFbErr(null);
    void getRecentAgentFeedback(10)
      .then((items) => {
        if (!cancelled) setRecentFb(items);
      })
      .catch(() => {
        if (!cancelled) {
          setRecentFbErr('Could not load recent feedback');
          setRecentFb([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRecentFbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  const refreshMcp = useCallback(async () => {
    setMcpLoading(true);
    setMcpErr(null);
    try {
      const rows = await getMcpIntegrations();
      setMcpList(rows);
    } catch {
      setMcpErr('Could not load integrations');
      setMcpList([]);
    } finally {
      setMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'integrations') return;
    void refreshMcp();
  }, [isOpen, activeTab, refreshMcp]);

  useEffect(() => {
    if (!mcpToast) return;
    const t = window.setTimeout(() => setMcpToast(null), 2000);
    return () => clearTimeout(t);
  }, [mcpToast]);

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

  useEffect(() => {
    if (!saveError) return;
    saveErrorRef.current?.focus();
  }, [saveError]);

  useEffect(() => {
    return () => {
      if (saveOkTimerRef.current != null) {
        window.clearTimeout(saveOkTimerRef.current);
      }
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaveOk(false);
    setSaveError(null);
    const issue = validateProfileName(fullName);
    if (issue) {
      setSaveError(profileSaveIssueMessage(issue));
      return;
    }
    setSaveBusy(true);
    try {
      const level = normalizeExpertiseLevel(expertiseLevel);
      const domain = domainForExpertiseLevel(level, expertiseDomain);
      await patchUserProfile({
        name: fullName.trim(),
        expertise_level: level,
        expertise_domain: domain,
      });
      localStorage.setItem('arena_expertise_level', level);
      localStorage.setItem('arena_expertise_domain', domain);
      await refreshUser();
      setSaveOk(true);
      if (saveOkTimerRef.current != null) window.clearTimeout(saveOkTimerRef.current);
      const hold = motionDuration(2000);
      saveOkTimerRef.current = window.setTimeout(() => {
        setSaveOk(false);
        saveOkTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : profileSaveCaughtErrorMessage(err);
      setSaveError(msg);
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

  const billingPeriod = (user.subscription_billing_period || sub?.billing_period || '').toLowerCase();
  const consecutive = user.consecutive_payments ?? 0;
  const showLoyaltyProgress =
    tierUpper === 'PRO' &&
    billingPeriod === 'monthly' &&
    consecutive > 0 &&
    !user.loyalty_reward_active;
  const showLoyaltyActive = user.loyalty_reward_active === true;

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
          { id: 'integrations' as const, label: 'Integrations', Icon: TabIconIntegrations },
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
            padding: mobile ? '8px 12px' : '10px 16px',
            fontSize: mobile ? 12 : 13,
            color: activeTab === id ? '#2C1810' : '#6B5040',
            fontFamily: 'Georgia, serif',
            cursor: 'pointer',
            transition: 'background 0.12s, color 0.12s',
            border: 'none',
            borderRight: mobile ? 'none' : activeTab === id ? '2px solid #C4956A' : '2px solid transparent',
            borderBottom: mobile
              ? activeTab === id
                ? '2px solid #C4956A'
                : '2px solid transparent'
              : 'none',
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
        alignItems: mobile ? 'flex-end' : 'center',
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
          width: mobile ? '100%' : 680,
          maxWidth: mobile ? 'none' : 'calc(100vw - 32px)',
          height: mobile ? '90vh' : 540,
          maxHeight: mobile ? '90vh' : 'calc(100vh - 48px)',
          background: '#FDFAF6',
          border: mobile ? 'none' : '0.5px solid #DDD0BC',
          borderRadius: mobile ? '20px 20px 0 0' : 14,
          display: 'flex',
          flexDirection: mobile ? 'column' : 'row',
          overflow: 'hidden',
          transformOrigin: origin === 'bottom-left' ? 'bottom left' : 'top right',
          animation: panelAnim,
        }}
      >
        {mobile ? (
          <div
            style={{
              width: 36,
              height: 4,
              background: '#D4C4B0',
              borderRadius: 2,
              margin: '12px auto 0',
              flexShrink: 0,
            }}
            aria-hidden
          />
        ) : null}
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
          <div style={{ padding: '18px 16px 16px', borderBottom: mobile ? 'none' : '0.5px solid #E0D5C5' }}>
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
            className="horizontal-scroll"
            style={{
              display: 'flex',
              flexDirection: mobile ? 'row' : 'column',
              marginTop: mobile ? 0 : 4,
              overflowX: mobile ? 'auto' : 'visible',
              flex: mobile ? undefined : 1,
              paddingBottom: mobile ? 4 : 0,
              borderBottom: mobile ? '0.5px solid #E0D5C5' : 'none',
            }}
          >
            {tabs}
          </nav>
          <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '0.5px solid #E0D5C5' }}>
            <Button type="button" variant="ghost" size="sm" icon={Icons.logout(14)} onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </aside>

        <div style={{ flex: 1, padding: mobile ? '16px' : '28px 30px', overflowY: 'auto' }}>
          <div style={{ display: activeTab === 'account' ? 'block' : 'none' }}>
            <h2 id="profile-modal-title" style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>
              Account
            </h2>
            <p style={{ fontSize: 14, color: '#A89070', marginBottom: 24 }}>Manage your profile and expertise calibration</p>

            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="profile-full-name"
                style={{
                  display: 'block',
                  fontSize: 10,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: '#A89070',
                  marginBottom: 6,
                }}
              >
                Full name
              </label>
              <input
                id="profile-full-name"
                value={fullName}
                maxLength={PROFILE_NAME_MAX}
                autoComplete="name"
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (saveError) setSaveError(null);
                }}
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
            <div style={{ marginBottom: 18 }}>
              <ExpertiseSelector
                level={expertiseLevel}
                domain={expertiseDomain}
                disabled={saveBusy}
                onChange={(level, domain) => {
                  setExpertiseLevel(level);
                  setExpertiseDomain(domain);
                }}
              />
            </div>

            {saveError ? (
              <p
                ref={saveErrorRef}
                role="alert"
                tabIndex={-1}
                style={{
                  fontSize: 13,
                  color: '#993C1D',
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                  outline: 'none',
                }}
              >
                {saveError}
              </p>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
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
                {saveBusy ? 'Saving…' : 'Save changes'}
              </button>
              {saveOk ? (
                <span role="status" style={{ fontSize: 12, color: '#5A8C6A' }}>
                  Saved
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: activeTab === 'plan' ? 'block' : 'none' }}>
            <h2 style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>Your plan</h2>
            <p style={{ fontSize: 14, color: '#A89070', marginBottom: 16 }}>Current subscription and billing details</p>
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
                  <div style={{ fontSize: 18, color: '#C4956A', fontWeight: 500, letterSpacing: '0.02em', fontFamily: 'Georgia, serif' }}>{planLabel}</div>
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
                        <div style={{ fontSize: 28, color: '#C4956A', fontWeight: 500, fontFamily: 'Georgia, serif' }}>
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
                {showLoyaltyActive ? (
                  <div
                    style={{
                      background: '#EAF3DE',
                      border: '0.5px solid #97C459',
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#3B6D11', fontWeight: 500 }}>🎁 Your loyalty reward is active</div>
                    <div style={{ fontSize: 11, color: '#5A8C6A', marginTop: 6, lineHeight: 1.5 }}>
                      Months 11 &amp; 12 are free — billing resumes automatically after.
                      {user.loyalty_resume_at
                        ? ` (${new Date(user.loyalty_resume_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`
                        : ''}
                    </div>
                  </div>
                ) : showLoyaltyProgress ? (
                  <div
                    style={{
                      background: '#FAF7F2',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A89070' }}>
                        Loyalty reward
                      </span>
                      <span
                        style={{
                          background: '#F0E8DC',
                          color: '#8C7355',
                          fontSize: 10,
                          borderRadius: 8,
                          padding: '4px 10px',
                        }}
                      >
                        Months 11 &amp; 12 free
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#EDE4D8', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min((consecutive / 10) * 100, 100)}%`,
                          background: '#C4956A',
                          borderRadius: 3,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: '#A89070', marginTop: 5 }}>
                      Month {consecutive} of 10 — {Math.max(10 - consecutive, 0)} months to go
                    </div>
                    {consecutive >= 8 ? (
                      <div style={{ fontSize: 11, color: '#C4956A', fontStyle: 'italic', marginTop: 8, lineHeight: 1.45 }}>
                        Almost there — stay through month 10 and get months 11 &amp; 12 completely free
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ marginBottom: 8 }}>
                  <Button type="button" variant="secondary" size="sm" fullWidth onClick={handleManagePlan}>
                    {tierUpper === 'FREE' || tierUpper === 'GUEST' ? 'Upgrade plan' : 'Manage plan'}
                  </Button>
                </div>
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
                {tierUpper === 'PLUS' ? (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: '#A89070',
                        marginTop: 16,
                        marginBottom: 10,
                      }}
                    >
                      Agent Mode add-on
                    </div>
                    {!user.agent_addon_active && !user.agent_addon_cancelling ? (
                      <div
                        style={{
                          background: '#FAF7F2',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 8,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                          <span style={{ fontSize: 14, color: '#2C1810', fontWeight: 500 }}>Agent Mode</span>
                          <span style={{ fontSize: 14, color: '#C4956A' }}>₹599/month</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#A89070', fontStyle: 'italic', margin: '0 0 12px', lineHeight: 1.5 }}>
                          7-stage research pipeline · Full Agent access · Plus limits apply
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#4A3728', marginBottom: 0 }}>
                          <span>✓ Planner → Researcher → Solver pipeline</span>
                          <span>✓ Confidence calibration + source integrity</span>
                          <span>✓ Cancel anytime from your profile</span>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Button type="button" variant="primary" size="md" fullWidth onClick={() => setAddonCheckout(true)}>
                            Add Agent Mode — ₹599/mo
                          </Button>
                        </div>
                      </div>
                    ) : user.agent_addon_active && !user.agent_addon_cancelling ? (
                      <div
                        style={{
                          background: '#EAF3DE',
                          border: '0.5px solid #97C459',
                          borderRadius: 8,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 14, color: '#2C1810', fontWeight: 500 }}>Agent Mode</span>
                          <span
                            style={{
                              background: '#639922',
                              color: '#FAF7F2',
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '2px 8px',
                              borderRadius: 8,
                            }}
                          >
                            Active
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#5A8C6A', margin: 0, lineHeight: 1.5 }}>₹599/month · Renews automatically</p>
                        {!addonCancelConfirm ? (
                          <button
                            type="button"
                            onClick={() => setAddonCancelConfirm(true)}
                            style={{
                              marginTop: 10,
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: 12,
                              color: '#A89070',
                              textDecoration: 'underline dotted',
                              cursor: 'pointer',
                              fontFamily: 'Georgia, serif',
                            }}
                          >
                            Cancel add-on →
                          </button>
                        ) : (
                          <div
                            style={{
                              marginTop: 10,
                              background: '#FAF7F2',
                              border: '0.5px solid #E0D5C5',
                              borderRadius: 8,
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ fontSize: 12, color: '#2C1810', marginBottom: 8 }}>Cancel Agent add-on?</div>
                            <div style={{ fontSize: 11, color: '#A89070', marginBottom: 10, lineHeight: 1.45 }}>
                              You keep access until end of current billing period.
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                disabled={addonBusy}
                                onClick={() => setAddonCancelConfirm(false)}
                                style={{
                                  border: '0.5px solid #D4C4B0',
                                  color: '#8C7355',
                                  borderRadius: 20,
                                  padding: '6px 14px',
                                  fontSize: 12,
                                  background: 'transparent',
                                  cursor: addonBusy ? 'default' : 'pointer',
                                  fontFamily: 'Georgia, serif',
                                }}
                              >
                                Keep add-on
                              </button>
                              <button
                                type="button"
                                disabled={addonBusy}
                                onClick={async () => {
                                  setAddonBusy(true);
                                  try {
                                    await cancelAgentAddon();
                                    setAddonCancelConfirm(false);
                                    await refreshUser();
                                    await refreshTier();
                                  } catch {
                                    // ignore; could surface toast
                                  } finally {
                                    setAddonBusy(false);
                                  }
                                }}
                                style={{
                                  border: '0.5px solid #F0997B',
                                  color: '#993C1D',
                                  borderRadius: 20,
                                  padding: '6px 14px',
                                  fontSize: 12,
                                  background: 'transparent',
                                  cursor: addonBusy ? 'default' : 'pointer',
                                  fontFamily: 'Georgia, serif',
                                }}
                              >
                                {addonBusy ? '…' : 'Yes, cancel'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : user.agent_addon_cancelling ? (
                      <div
                        style={{
                          background: '#FDF6EC',
                          border: '0.5px solid #E8C87A',
                          borderRadius: 8,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 14, color: '#2C1810', fontWeight: 500 }}>Agent Mode</span>
                          <span
                            style={{
                              background: '#BA7517',
                              color: '#FAF7F2',
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '2px 8px',
                              borderRadius: 8,
                            }}
                          >
                            Cancelling
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#854F0B', margin: '0 0 10px', lineHeight: 1.5 }}>Access continues until billing period ends</p>
                        <button
                          type="button"
                          disabled={addonBusy}
                          onClick={async () => {
                            setAddonBusy(true);
                            try {
                              await reactivateAgentAddon();
                              await refreshUser();
                              await refreshTier();
                            } catch {
                              // ignore
                            } finally {
                              setAddonBusy(false);
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: 12,
                            color: '#C4956A',
                            textDecoration: 'underline dotted',
                            cursor: addonBusy ? 'default' : 'pointer',
                            fontFamily: 'Georgia, serif',
                          }}
                        >
                          Changed your mind? Reactivate →
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {addonCheckout && user.email ? (
                  <RazorpayCheckout
                    planKey="agent_addon"
                    agentAddon
                    prefillEmail={user.email}
                    onSuccess={async () => {
                      setAddonCheckout(false);
                      const s = await getSubscriptionStatus();
                      setSub(s);
                      await refreshUser();
                      await refreshTier();
                    }}
                    onError={() => setAddonCheckout(false)}
                    onClose={() => setAddonCheckout(false)}
                  />
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
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A89070',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                  }}
                >
                  Answer confidence calibration
                </div>
                {calLoading ? (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader />
                  </div>
                ) : calErr ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>{calErr}</p>
                ) : calStats && (calStats.total_ratings ?? 0) > 0 ? (
                  <div
                    style={{
                      background: '#F0E8DC',
                      borderRadius: 10,
                      padding: '16px 18px',
                      border: '0.5px solid #E0D5C5',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#A89070', marginBottom: 4 }}>Calibration score</div>
                        <div style={{ fontSize: 28, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>
                          {calStats.calibration_score ?? 0}
                          <span style={{ fontSize: 14, color: '#8C7355' }}>/100</span>
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 10, color: '#A89070', marginBottom: 4 }}>Avg. gap vs system</div>
                        <div style={{ fontSize: 15, color: '#4A3728', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(calStats.avg_delta ?? 0) > 0 ? (
                            <span style={{ color: '#639922' }}>↑</span>
                          ) : (calStats.avg_delta ?? 0) < 0 ? (
                            <span style={{ color: '#C0392B' }}>↓</span>
                          ) : (
                            <span style={{ color: '#8C7355' }}>→</span>
                          )}
                          {(calStats.avg_delta ?? 0).toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: 8,
                            textTransform: 'capitalize',
                            background:
                              calStats.trend === 'improving'
                                ? '#EAF3DE'
                                : calStats.trend === 'diverging'
                                  ? '#FCF0EE'
                                  : '#FDF6EC',
                            color:
                              calStats.trend === 'improving'
                                ? '#3B6D11'
                                : calStats.trend === 'diverging'
                                  ? '#993C1D'
                                  : '#854F0B',
                            border: '0.5px solid',
                            borderColor:
                              calStats.trend === 'improving'
                                ? '#97C459'
                                : calStats.trend === 'diverging'
                                  ? '#F0997B'
                                  : '#E8C87A',
                          }}
                        >
                          {calStats.trend === 'improving'
                            ? 'Improving'
                            : calStats.trend === 'diverging'
                              ? 'Diverging'
                              : 'Stable'}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#A89070', marginRight: 4 }}>Last 5</span>
                      {(calStats.recent_ratings ?? []).map((r, i) => {
                        const d = Number(r.delta ?? 0);
                        const a = Math.abs(d);
                        const bg = a <= 10 ? '#639922' : a <= 25 ? '#BA7517' : '#C0392B';
                        return (
                          <span
                            key={`${r.created_at ?? i}`}
                            title={`Δ ${d}`}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: bg,
                              opacity: 0.85,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>
                    Rate your confidence on completed Agent answers to build your calibration profile.
                  </p>
                )}
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A89070',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                  }}
                >
                  Feedback accuracy
                </div>
                {fbAccLoading ? (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader />
                  </div>
                ) : fbAccErr ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>{fbAccErr}</p>
                ) : fbAcc && fbAcc.total > 0 ? (
                  <div
                    style={{
                      background: '#F0E8DC',
                      borderRadius: 10,
                      padding: '16px 18px',
                      border: '0.5px solid #E0D5C5',
                    }}
                  >
                    <div
                      style={{
                        height: 10,
                        borderRadius: 5,
                        overflow: 'hidden',
                        display: 'flex',
                        background: '#EDE4D8',
                      }}
                    >
                      {fbAcc.correct_pct > 0 ? (
                        <div style={{ width: `${fbAcc.correct_pct}%`, background: '#639922' }} />
                      ) : null}
                      {fbAcc.partial_pct > 0 ? (
                        <div style={{ width: `${fbAcc.partial_pct}%`, background: '#BA7517' }} />
                      ) : null}
                      {fbAcc.wrong_pct > 0 ? (
                        <div style={{ width: `${fbAcc.wrong_pct}%`, background: '#C0392B' }} />
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11 }}>
                      <span style={{ color: '#639922' }}>Correct {fbAcc.correct_pct}%</span>
                      <span style={{ color: '#BA7517' }}>Partial {fbAcc.partial_pct}%</span>
                      <span style={{ color: '#C0392B' }}>Wrong {fbAcc.wrong_pct}%</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#A89070', marginTop: 10, marginBottom: 0 }}>
                      Based on {fbAcc.total} rated answer{fbAcc.total === 1 ? '' : 's'}
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>
                    Rate completed Agent answers as correct, partial, or wrong to see your accuracy mix here.
                  </p>
                )}
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A89070',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                  }}
                >
                  Recent ratings
                </div>
                {recentFbLoading ? (
                  <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader />
                  </div>
                ) : recentFbErr ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>{recentFbErr}</p>
                ) : recentFb.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>
                    Your latest ratings will show here as you rate Agent answers.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {recentFb.map((item) => {
                      const verdict = (item.verdict || '').toLowerCase();
                      const tone =
                        verdict === 'correct'
                          ? { bg: 'rgba(138,168,153,0.18)', fg: '#3F6B4A' }
                          : verdict === 'partial'
                            ? { bg: 'rgba(196,149,106,0.18)', fg: '#8C5A2C' }
                            : { bg: 'rgba(217,83,79,0.15)', fg: '#9C2F2A' };
                      return (
                        <li
                          key={item.task_id}
                          style={{
                            background: '#F0E8DC',
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 10,
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              borderRadius: 999,
                              padding: '2px 8px',
                              background: tone.bg,
                              color: tone.fg,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {verdict || 'unknown'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                color: '#2C1810',
                                lineHeight: 1.4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {item.title || item.task_text || item.task_id}
                            </div>
                            {item.note ? (
                              <p
                                style={{
                                  fontSize: 11,
                                  color: '#6B6460',
                                  marginTop: 4,
                                  marginBottom: 0,
                                  fontStyle: 'italic',
                                  lineHeight: 1.4,
                                }}
                              >
                                “{item.note}”
                              </p>
                            ) : null}
                            <div
                              style={{
                                fontSize: 11,
                                color: '#A89070',
                                marginTop: 4,
                              }}
                              title={item.created_at ? new Date(item.created_at).toLocaleString() : undefined}
                            >
                              Rated {formatRelativeConnected(item.created_at)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          <div style={{ display: activeTab === 'integrations' ? 'block' : 'none', maxHeight: mobile ? undefined : 'min(72vh, 640px)' }}>
            <h2 style={{ fontSize: 18, color: '#2C1810', fontFamily: 'Georgia, serif', fontWeight: 500 }}>Integrations</h2>
            <p style={{ fontSize: 12, color: '#A89070', marginBottom: 16 }}>
              Connect your tools to include personal context in Agent research.
            </p>
            {mcpLoading ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <MicroLoader />
              </div>
            ) : mcpErr ? (
              <p style={{ fontSize: 13, color: '#8C7355' }}>{mcpErr}</p>
            ) : (
              <>
                {mcpToast ? (
                  <div
                    role="status"
                    style={{
                      marginBottom: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#EAF3DE',
                      border: '0.5px solid #97C459',
                      fontSize: 13,
                      color: '#3B6D11',
                    }}
                  >
                    {mcpToast}
                  </div>
                ) : null}
                {!mcpList.length ? (
                  <div
                    style={{
                      background: '#FAF7F2',
                      borderRadius: 10,
                      padding: 20,
                      textAlign: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <PlugIcon size={20} color="#D4C4B0" />
                    </div>
                    <p style={{ fontSize: 14, color: '#A89070', fontStyle: 'italic', margin: 0 }}>
                      No tools connected yet
                    </p>
                    <p style={{ fontSize: 12, color: '#C4A882', marginTop: 4, marginBottom: 0 }}>
                      Connect a service below to include your documents in Agent research
                    </p>
                  </div>
                ) : null}
                {mcpList.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#A89070',
                        marginBottom: 8,
                      }}
                    >
                      Connected
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {mcpList
                        .filter((r: any) => r.is_active)
                        .map((row: any) => {
                          const meta = SERVICES.find((s) => s.id === row.service);
                          const label = meta?.name || row.display_name || row.service;
                          return (
                            <div
                              key={row.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                background: '#EAF3DE',
                                border: '0.5px solid #97C459',
                                borderRadius: 20,
                                padding: '5px 12px 5px 8px',
                              }}
                            >
                              <span style={{ display: 'flex', flexShrink: 0 }}>{getBrandIcon(row.service, 16)}</span>
                              <span style={{ fontSize: 12, color: '#2C1810' }}>{label}</span>
                              <button
                                type="button"
                                aria-label={`Remove ${label}`}
                                onClick={() => {
                                  if (
                                    typeof window !== 'undefined' &&
                                    window.confirm(`Remove ${label} from connected tools?`)
                                  ) {
                                    void (async () => {
                                      try {
                                        await deleteMcpIntegration(row.id);
                                        await refreshMcp();
                                        setMcpDisconnectTarget(null);
                                      } catch {
                                        /* ignore */
                                      }
                                    })();
                                  }
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '0 0 0 4px',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  color: '#A89070',
                                  lineHeight: 1,
                                }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                    </div>
                    <div
                      style={{
                        height: 0,
                        borderTop: '0.5px solid #E0D5C5',
                        marginBottom: 16,
                      }}
                    />
                  </>
                ) : null}
                <div
                  className="profile-modal-integrations-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 1fr)',
                    gap: 10,
                    maxHeight: 420,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {SERVICES.map((service) => {
                    const row = mcpList.find((r: any) => r.service === service.id && r.is_active);
                    const connected = Boolean(row);
                    const expanded = mcpExpandedId === service.id && !connected;
                    const tokenVal = mcpTokenInputs[service.id] ?? '';
                    const showDisconnectConfirm = connected && mcpDisconnectTarget?.id === row.id;

                    return (
                      <div
                        key={service.id}
                        style={{
                          background: connected ? '#F0F7ED' : '#FAF7F2',
                          border: connected ? '0.5px solid #97C459' : '0.5px solid #E0D5C5',
                          borderRadius: 10,
                          padding: 14,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: service.bg_color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {getBrandIcon(service.id, 20)}
                          </div>
                          <div style={{ fontSize: 14, color: '#2C1810', fontWeight: 500, flex: 1 }}>{service.name}</div>
                          <span
                            style={{
                              fontSize: 10,
                              textTransform: connected ? 'uppercase' : 'none',
                              fontWeight: connected ? 600 : 400,
                              padding: '2px 8px',
                              borderRadius: 8,
                              background: connected ? '#EAF3DE' : '#F0E8DC',
                              color: connected ? '#3B6D11' : '#8C7355',
                              border: connected ? '0.5px solid #97C459' : 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {connected ? '✓ Connected' : 'Not connected'}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: '#A89070', fontStyle: 'italic', margin: '0 0 10px' }}>
                          {service.description}
                        </p>
                        {!connected ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setMcpExpandedId((prev) => (prev === service.id ? null : service.id))
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 11,
                                color: '#C4956A',
                                marginBottom: expanded ? 10 : 0,
                              }}
                            >
                              How to connect ›
                            </button>
                            {expanded ? (
                              <>
                                <div
                                  style={{
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    color: '#A89070',
                                    marginBottom: 4,
                                  }}
                                >
                                  How to connect
                                </div>
                                <p style={{ fontSize: 11, color: '#6B5040', lineHeight: 1.6, margin: '0 0 10px' }}>
                                  {service.how_to}
                                </p>
                                <div
                                  style={{
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    color: '#A89070',
                                    marginBottom: 4,
                                  }}
                                >
                                  Paste your API token
                                </div>
                                <input
                                  type="password"
                                  value={tokenVal}
                                  onChange={(e) =>
                                    setMcpTokenInputs((prev) => ({ ...prev, [service.id]: e.target.value }))
                                  }
                                  placeholder={service.placeholder}
                                  autoComplete="off"
                                  style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    border: '0.5px solid #D4C4B0',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    fontSize: 12,
                                    fontFamily: 'Georgia, serif',
                                    background: '#FDFAF6',
                                    outline: 'none',
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#C4956A';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#D4C4B0';
                                  }}
                                />
                                <div style={{ marginTop: 8 }}>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    fullWidth
                                    icon={Icons.plug(14)}
                                    disabled={!tokenVal.trim() || mcpConnectBusy === service.id}
                                    loading={mcpConnectBusy === service.id}
                                    onClick={async () => {
                                      const tok = tokenVal.trim();
                                      if (tok.length < 8) return;
                                      setMcpConnectBusy(service.id);
                                      try {
                                        await postMcpManualConnect({
                                          service: service.id,
                                          access_token: tok,
                                          display_name: service.name,
                                        });
                                        setMcpTokenInputs((prev) => ({ ...prev, [service.id]: '' }));
                                        setMcpExpandedId(null);
                                        await refreshMcp();
                                        setMcpToast(`${service.name} connected`);
                                      } catch {
                                        /* silent */
                                      } finally {
                                        setMcpConnectBusy(null);
                                      }
                                    }}
                                  >
                                    {`Connect ${service.name}`}
                                  </Button>
                                </div>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 11, color: '#5A8C6A', margin: '0 0 8px' }}>
                              Connected · {formatRelativeConnected(row.connected_at)}
                            </p>
                            {showDisconnectConfirm ? (
                              <div
                                style={{
                                  background: '#FDFAF6',
                                  border: '0.5px solid #E0D5C5',
                                  borderRadius: 8,
                                  padding: 10,
                                  marginBottom: 8,
                                }}
                              >
                                <p style={{ fontSize: 11, color: '#6B5040', lineHeight: 1.5, margin: '0 0 10px' }}>
                                  Remove {service.name}? Your tasks using this source will still work until you re-run
                                  them.
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => setMcpDisconnectTarget(null)}
                                    style={{
                                      flex: 1,
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      border: '0.5px solid #D4C4B0',
                                      background: '#FAF7F2',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      color: '#2C1810',
                                    }}
                                  >
                                    Keep
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await deleteMcpIntegration(row.id);
                                        await refreshMcp();
                                      } catch {
                                        /* ignore */
                                      } finally {
                                        setMcpDisconnectTarget(null);
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      border: 'none',
                                      background: '#C0392B',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      color: '#fff',
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => setMcpDisconnectTarget({ id: row.id, name: service.name })}
                              >
                                Disconnect
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
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
