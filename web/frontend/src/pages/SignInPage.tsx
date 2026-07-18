import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { MotionButton } from '../components/MotionButton';
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
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromSearch(searchParams.get('tab')));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [continueLabel] = useState(() =>
    describeRedirectDestination(getRedirectIntent()),
  );
  const reduceMotion = prefersReducedMotion();

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

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setError('');
    setPassword('');
    setConfirmPassword('');
    if (tab === 'signup') setName('');
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

  const busy = isLoading || authLoading;

  return (
    <div className={`auth-page${reduceMotion ? ' auth-page--static' : ''}`}>
      <div className="auth-page__brand-col">
        <button type="button" className="auth-page__logo" onClick={() => navigate('/')}>
          <span className="auth-page__logo-mark" aria-hidden />
          <span className="auth-page__logo-text">
            ARENA<span>.</span>
          </span>
        </button>

        <div className="auth-page__brand-body">
          <p className="auth-page__eyebrow">Your thinking panel</p>
          <h1 className="auth-page__headline">
            Four minds.
            <span className="auth-page__headline-accent"> One account.</span>
          </h1>
          <p className="auth-page__sub">
            Save history, keep your panel synced, and pick up where you left off — free to start.
          </p>
          <div className="auth-page__brand-proof" aria-hidden="true">
            <span className="auth-page__proof-chip">Free forever</span>
            <span className="auth-page__proof-chip">No card</span>
            <span className="auth-page__proof-chip">4 personas</span>
          </div>
        </div>

        <div className="auth-page__agent-grid" aria-hidden>
          {[
            { name: 'The Analyst', color: '#8C9BAB' },
            { name: 'The Philosopher', color: '#9B8FAA' },
            { name: 'The Pragmatist', color: '#8AA899' },
            { name: 'The Contrarian', color: '#B0977E' },
          ].map((agent) => (
            <div key={agent.name} className="auth-page__agent-chip">
              <span className="auth-page__agent-dot" style={{ background: agent.color }} />
              <span>{agent.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-page__form-col">
        <div className="auth-page__form-card">
          <button type="button" className="auth-page__mobile-logo" onClick={() => navigate('/')}>
            <span className="auth-page__logo-mark" aria-hidden />
            ARENA<span>.</span>
          </button>

          <div className="auth-page__tabs" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'signin'}
              className={`auth-page__tab${activeTab === 'signin' ? ' auth-page__tab--active' : ''}`}
              onClick={() => switchTab('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'signup'}
              className={`auth-page__tab${activeTab === 'signup' ? ' auth-page__tab--active' : ''}`}
              onClick={() => switchTab('signup')}
            >
              Sign up
            </button>
          </div>

          {activeTab === 'signin' ? (
            <form className="auth-page__form" onSubmit={handleSignIn}>
              <h2 className="auth-page__form-title">Welcome back</h2>
              <p className="auth-page__form-sub">Sign in to continue to Arena</p>
              <p className="auth-page__continue">
                After sign in you&apos;ll continue to <strong>{continueLabel}</strong>.
              </p>

              <label className="auth-page__field" htmlFor="signin-email">
                <span className="auth-page__label">Email</span>
                <input
                  id="signin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-page__input"
                />
              </label>

              <label className="auth-page__field" htmlFor="signin-password">
                <span className="auth-page__label">Password</span>
                <span className="auth-page__password-wrap">
                  <input
                    id="signin-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="auth-page__input auth-page__input--password"
                  />
                  <button
                    type="button"
                    className="auth-page__reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
                  </button>
                </span>
              </label>

              {error ? (
                <p ref={errorRef} role="alert" tabIndex={-1} className="auth-page__error">
                  {error}
                </p>
              ) : null}

              <MotionButton type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={busy}>
                Sign in to Arena
              </MotionButton>

              <ul className="auth-page__form-trust" aria-hidden="true">
                <li>Encrypted sessions</li>
                <li>Cancel anytime</li>
              </ul>

              <p className="auth-page__switch">
                Don&apos;t have an account?{' '}
                <button type="button" className="auth-page__link" onClick={() => switchTab('signup')}>
                  Sign up free
                </button>
              </p>
            </form>
          ) : (
            <form className="auth-page__form" onSubmit={handleSignUp}>
              <h2 className="auth-page__form-title">Create your account</h2>
              <p className="auth-page__form-sub">Free forever · No card required</p>
              <p className="auth-page__continue">
                After signup you&apos;ll continue to <strong>{continueLabel}</strong>.
              </p>

              <label className="auth-page__field" htmlFor="signup-name">
                <span className="auth-page__label">Name</span>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="auth-page__input"
                />
              </label>

              <label className="auth-page__field" htmlFor="signup-email">
                <span className="auth-page__label">Email</span>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-page__input"
                />
              </label>

              <label className="auth-page__field" htmlFor="signup-password">
                <span className="auth-page__label">Password</span>
                <span className="auth-page__password-wrap">
                  <input
                    id="signup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="auth-page__input auth-page__input--password"
                  />
                  <button
                    type="button"
                    className="auth-page__reveal"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
                  </button>
                </span>
              </label>

              {passwordStrength ? (
                <div
                  className={`auth-page__strength auth-page__strength--${passwordStrength}`}
                  aria-hidden
                >
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}

              <label className="auth-page__field" htmlFor="signup-confirm">
                <span className="auth-page__label">Confirm password</span>
                <span className="auth-page__password-wrap">
                  <input
                    id="signup-confirm"
                    name="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="auth-page__input auth-page__input--password"
                  />
                  <button
                    type="button"
                    className="auth-page__reveal"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff width={16} height={16} />
                    ) : (
                      <Eye width={16} height={16} />
                    )}
                  </button>
                </span>
              </label>

              <p className="auth-page__hint">Min 8 characters</p>

              {error ? (
                <p ref={errorRef} role="alert" tabIndex={-1} className="auth-page__error">
                  {error}
                </p>
              ) : null}

              <MotionButton type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={busy}>
                Create free account
              </MotionButton>

              <ul className="auth-page__form-trust" aria-hidden="true">
                <li>Free forever</li>
                <li>No card required</li>
              </ul>

              <p className="auth-page__switch">
                Already have an account?{' '}
                <button type="button" className="auth-page__link" onClick={() => switchTab('signin')}>
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
