import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { MotionButton } from '../components/MotionButton';
import { PrismBuddy, type PrismBuddyAction, type PrismBuddyMode } from '../components/PrismBuddy';
import { useAuth } from '../hooks/useAuth';
import {
  getRedirectIntent,
  clearRedirectIntent,
  describeRedirectDestination,
} from '../utils/redirectIntent';
import {
  authCaughtErrorMessage,
  signupClientIssueMessage,
  validateSignupFields,
} from '../lib/authFormMessages';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/verdict-auth-portal.css';

type Tab = 'signin' | 'signup';
type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | null;

function tabFromSearch(raw: string | null): Tab {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'signup' || v === 'sign-up' || v === 'create' || v === 'register') {
    return 'signup';
  }
  return 'signin';
}

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, login, register, isLoading: authLoading } = useAuth();
  const handledInitialUser = useRef(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const buddyRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromSearch(searchParams.get('tab')));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<'name' | 'email' | 'password' | 'confirm' | null>(null);
  const [isBuddyRecovering, setIsBuddyRecovering] = useState(false);
  const [buddyAction, setBuddyAction] = useState<PrismBuddyAction>('none');
  const buddyActionTimer = useRef(0);
  const buddyPlayIndex = useRef(0);
  const buddyIdleIndex = useRef(0);
  const hasBuddyGreeted = useRef(false);
  const wasPrivateEntry = useRef(false);
  const [continueLabel] = useState(() =>
    describeRedirectDestination(getRedirectIntent()),
  );
  const reduceMotion = prefersReducedMotion();
  const isPrivateEntry = focusedField === 'password' || focusedField === 'confirm' || showPassword || showConfirmPassword;
  const busy = isLoading || authLoading;
  const isConfirmMatch = activeTab === 'signup' && confirmPassword.length > 0 && confirmPassword === password;

  const playBuddyAction = useCallback((action: PrismBuddyAction, duration = 1500) => {
    window.clearTimeout(buddyActionTimer.current);
    setBuddyAction(action);
    buddyActionTimer.current = window.setTimeout(() => setBuddyAction('none'), duration);
  }, []);

  const hasDirectedBuddyAction = busy || Boolean(error) || buddyAction !== 'none';
  const buddyMode: PrismBuddyMode = isPrivateEntry
    ? 'private'
    : isBuddyRecovering && !hasDirectedBuddyAction
      ? 'recovering'
      : focusedField
        ? 'attentive'
        : 'idle';
  const effectiveBuddyAction: PrismBuddyAction = isPrivateEntry
    ? buddyAction === 'match' ? 'match' : 'none'
    : busy
      ? 'thinking'
      : error
        ? 'concerned'
        : buddyAction;

  const getPasswordStrength = (pwd: string): PasswordStrength => {
    if (!pwd) return null;
    if (pwd.length < 6) return 'weak';
    if (pwd.length < 8) return 'fair';
    if (pwd.length < 12) return 'good';
    return 'strong';
  };

  const passwordStrength = activeTab === 'signup' ? getPasswordStrength(password) : null;

  // Keep tab in sync when URL changes (e.g. browser back, deep link)
  useEffect(() => {
    setActiveTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    if (handledInitialUser.current) return;
    handledInitialUser.current = true;
    if (!user) return;
    const destination = getRedirectIntent();
    clearRedirectIntent();
    navigate(destination, { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
  }, [error]);

  useEffect(() => () => window.clearTimeout(buddyActionTimer.current), []);

  useEffect(() => {
    if (hasBuddyGreeted.current || reduceMotion || isPrivateEntry || buddyAction !== 'none') return;
    hasBuddyGreeted.current = true;
    const greetingTimer = window.setTimeout(() => playBuddyAction('wave', 1700), 550);
    return () => window.clearTimeout(greetingTimer);
  }, [reduceMotion, isPrivateEntry, buddyAction, playBuddyAction]);

  useEffect(() => {
    if (reduceMotion || isPrivateEntry || busy || error || buddyAction !== 'none') return;
    const idleTimer = window.setTimeout(() => {
      const idleScenes: PrismBuddyAction[] = ['stretch', 'wave', 'dance'];
      const nextScene = idleScenes[buddyIdleIndex.current % idleScenes.length];
      buddyIdleIndex.current += 1;
      playBuddyAction(nextScene, nextScene === 'dance' ? 2100 : 1800);
    }, 8500);
    return () => window.clearTimeout(idleTimer);
  }, [reduceMotion, isPrivateEntry, busy, error, buddyAction, name, email, password, confirmPassword, playBuddyAction]);

  useEffect(() => {
    let recoveryTimer = 0;
    if (wasPrivateEntry.current && !isPrivateEntry) {
      setIsBuddyRecovering(true);
      recoveryTimer = window.setTimeout(() => setIsBuddyRecovering(false), 1100);
    } else if (isPrivateEntry) {
      setIsBuddyRecovering(false);
    }
    wasPrivateEntry.current = isPrivateEntry;
    return () => window.clearTimeout(recoveryTimer);
  }, [isPrivateEntry]);

  useEffect(() => {
    const buddy = buddyRef.current;
    if (!buddy) return;
    const resetPointer = () => {
      buddy.style.setProperty('--buddy-look-x', '0px');
      buddy.style.setProperty('--buddy-look-y', '0px');
      buddy.style.setProperty('--buddy-tilt', '0deg');
    };
    if (reduceMotion || isPrivateEntry) {
      resetPointer();
      return;
    }
    let frame = 0;
    const trackPointer = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = buddy.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth * 0.34)));
        const dy = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height * 0.42)) / (window.innerHeight * 0.34)));
        buddy.style.setProperty('--buddy-look-x', `${(dx * 8).toFixed(2)}px`);
        buddy.style.setProperty('--buddy-look-y', `${(dy * 6).toFixed(2)}px`);
        buddy.style.setProperty('--buddy-tilt', `${(dx * 2.2).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', trackPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', resetPointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', trackPointer);
      document.documentElement.removeEventListener('pointerleave', resetPointer);
    };
  }, [reduceMotion, isPrivateEntry]);

  const handleBuddyActivate = () => {
    if (isPrivateEntry) {
      playBuddyAction('match', 1100);
      return;
    }
    const playScenes: PrismBuddyAction[] = ['boop', 'wave', 'dance'];
    const nextScene = playScenes[buddyPlayIndex.current % playScenes.length];
    buddyPlayIndex.current += 1;
    playBuddyAction(nextScene, nextScene === 'dance' ? 2100 : 1300);
  };

  const handleNameChange = (nextName: string) => {
    const becameReady = name.trim().length < 2 && nextName.trim().length >= 2;
    setName(nextName);
    if (becameReady) playBuddyAction('approve', 1200);
  };

  const handleEmailChange = (nextEmail: string) => {
    const isReady = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const becameReady = !isReady(email) && isReady(nextEmail);
    setEmail(nextEmail);
    if (becameReady) playBuddyAction('approve', 1200);
  };

  const handlePasswordChange = (nextPassword: string) => {
    const becameStrong = getPasswordStrength(password) !== 'strong' && getPasswordStrength(nextPassword) === 'strong';
    setPassword(nextPassword);
    if (becameStrong) playBuddyAction('match', 1400);
  };

  const handleConfirmChange = (nextConfirm: string) => {
    const wasMatching = confirmPassword.length > 0 && confirmPassword === password;
    const nowMatches = nextConfirm.length > 0 && nextConfirm === password;
    setConfirmPassword(nextConfirm);
    if (!wasMatching && nowMatches) playBuddyAction('match', 1500);
  };

  const handlePrivateBlur = (field: 'password' | 'confirm') => {
    setFocusedField(null);
    if (field === 'confirm' && isConfirmMatch) playBuddyAction('approve', 1400);
    if (field === 'password' && getPasswordStrength(password) === 'strong') playBuddyAction('approve', 1400);
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFocusedField(null);
    if (tab === 'signup') setName('');
    playBuddyAction('wave', 1500);
    setSearchParams(tab === 'signup' ? { tab: 'signup' } : {}, { replace: true });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(authCaughtErrorMessage(err, 'Sign in failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const issue = validateSignupFields({ name, password, confirmPassword });
    if (issue) {
      setError(signupClientIssueMessage(issue));
      return;
    }
    setIsLoading(true);
    try {
      await register(name.trim(), email, password);
    } catch (err) {
      setError(authCaughtErrorMessage(err, 'Account creation failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const isSignup = activeTab === 'signup';

  return (
    <div className={`auth-page auth-page--portal${isSignup ? ' auth-page--portal-signup' : ''}${reduceMotion ? ' auth-page--static' : ''}`}>
      <header className="auth-page__mast">
        <button type="button" className="auth-page__logo" onClick={() => navigate('/')} aria-label="Arena home">
          <span className="auth-page__logo-mark" aria-hidden />
          <span className="auth-page__logo-text">ARENA<span>.</span></span>
        </button>
        <button type="button" className="auth-page__back" onClick={() => navigate('/')}><ArrowLeft size={14} /> BACK TO THE VERDICT PRISM</button>
      </header>

      <main className="auth-page__stage">
        <section className="auth-page__brand-col">
          <div>
            <p className="auth-page__eyebrow">ARENA / {isSignup ? 'NEW PANEL' : 'RETURNING MIND'}</p>
            <h1 className="auth-page__headline">{isSignup ? <>Make room for<br/><em>better answers.</em></> : <>Return to<br/><em>the room.</em></>}</h1>
          </div>
          <div className="auth-page__brand-brief">
            <p>{isSignup ? 'Create a private place where four distinct minds can challenge every important question.' : 'Your panel, debates, saved verdicts, and investigations are exactly where you left them.'}</p>
            <div className="auth-page__tabs" role="tablist" aria-label="Auth mode">
              <button type="button" role="tab" aria-selected={!isSignup} className={`auth-page__tab${!isSignup ? ' auth-page__tab--active' : ''}`} onClick={() => switchTab('signin')}>Sign in</button>
              <button type="button" role="tab" aria-selected={isSignup} className={`auth-page__tab${isSignup ? ' auth-page__tab--active' : ''}`} onClick={() => switchTab('signup')}>Sign up</button>
            </div>
          </div>
        </section>

        <section className="auth-page__form-col">
          <div className="auth-page__form-card">
            <div className="auth-page__form-index"><span>ACCESS / {isSignup ? '02' : '01'}</span><b>{isSignup ? 'CREATE YOUR PANEL' : 'IDENTITY CHECK'}</b></div>
            {!isSignup ? (
              <form className="auth-page__form auth-page__form--signin" onSubmit={handleSignIn}>
                <div className="auth-page__form-heading"><h2 className="auth-page__form-title">Sign in</h2><p className="auth-page__form-sub">Continue to your Arena workspace.</p></div>
                <p className="auth-page__continue">Next: <strong>{continueLabel}</strong></p>
                <div className="auth-page__fields auth-page__fields--signin">
                  <label className="auth-page__field" htmlFor="signin-email"><span className="auth-page__label">Email</span><input id="signin-email" name="email" type="email" autoComplete="email" autoFocus inputMode="email" value={email} onChange={(e) => handleEmailChange(e.target.value)} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} required className="auth-page__input" /></label>
                  <label className="auth-page__field" htmlFor="signin-password"><span className="auth-page__label">Password</span><span className="auth-page__password-wrap"><input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} onFocus={() => setFocusedField('password')} onBlur={() => handlePrivateBlur('password')} required className="auth-page__input auth-page__input--password" /><button type="button" className="auth-page__reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff width={17} height={17} /> : <Eye width={17} height={17} />}</button></span></label>
                </div>
                {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="auth-page__error">{error}</p> : null}
                <div className="auth-page__action"><MotionButton type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={busy}>Sign in to Arena</MotionButton><p>New here? <button type="button" className="auth-page__link" onClick={() => switchTab('signup')}>Create an account</button></p></div>
              </form>
            ) : (
              <form className="auth-page__form auth-page__form--signup" onSubmit={handleSignUp}>
                <div className="auth-page__form-heading"><h2 className="auth-page__form-title">Create your panel</h2><p className="auth-page__form-sub">Free to start. No card required.</p></div>
                <p className="auth-page__continue">First stop: <strong>{continueLabel}</strong></p>
                <div className="auth-page__fields auth-page__fields--signup">
                  <label className="auth-page__field" htmlFor="signup-name"><span className="auth-page__label">Name</span><input id="signup-name" name="name" type="text" autoComplete="name" autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} required className="auth-page__input" /></label>
                  <label className="auth-page__field" htmlFor="signup-email"><span className="auth-page__label">Email</span><input id="signup-email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => handleEmailChange(e.target.value)} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} required className="auth-page__input" /></label>
                  <label className="auth-page__field" htmlFor="signup-password"><span className="auth-page__label">Password</span><span className="auth-page__password-wrap"><input id="signup-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} onFocus={() => setFocusedField('password')} onBlur={() => handlePrivateBlur('password')} required className="auth-page__input auth-page__input--password" /><button type="button" className="auth-page__reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff width={17} height={17} /> : <Eye width={17} height={17} />}</button></span>{passwordStrength ? <span className={`auth-page__strength auth-page__strength--${passwordStrength}`} aria-hidden><span /><span /><span /><span /></span> : null}</label>
                  <label className="auth-page__field" htmlFor="signup-confirm"><span className="auth-page__label">Confirm password</span><span className="auth-page__password-wrap"><input id="signup-confirm" name="confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(e) => handleConfirmChange(e.target.value)} onFocus={() => setFocusedField('confirm')} onBlur={() => handlePrivateBlur('confirm')} required className="auth-page__input auth-page__input--password" /><button type="button" className="auth-page__reveal" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>{showConfirmPassword ? <EyeOff width={17} height={17} /> : <Eye width={17} height={17} />}</button></span></label>
                </div>
                <p className="auth-page__hint">Use at least 8 characters.</p>
                {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="auth-page__error">{error}</p> : null}
                <div className="auth-page__action"><MotionButton type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={busy}>Create free account</MotionButton><p>Already have an account? <button type="button" className="auth-page__link" onClick={() => switchTab('signin')}>Sign in</button></p></div>
              </form>
            )}
          </div>

          <aside className={`auth-page__panel-preview auth-page__buddy-panel auth-page__buddy-panel--cute is-${buddyMode}`}>
            <div className="auth-page__buddy-stage" ref={buddyRef} data-mode={buddyMode} data-action={effectiveBuddyAction}>
              <PrismBuddy mode={buddyMode} action={effectiveBuddyAction} onActivate={handleBuddyActivate} />
            </div>
          </aside>
        </section>

        <footer className="auth-page__footer"><span>PRIVATE BY DEFAULT</span><span>SAVED CONTEXT</span><span>3 FREE RUNS</span><span>ARENA © 2026</span></footer>
      </main>
    </div>
  );
}
