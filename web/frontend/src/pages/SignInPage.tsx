import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/Button';
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

type Tab = 'signin' | 'signup';
type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | null;

export function SignInPage() {
  const navigate = useNavigate();
  const { user, login, register, isLoading: authLoading } = useAuth();
  const handledInitialUser = useRef(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Snapshot once so clearing after login doesn't flicker the banner.
  const [continueLabel] = useState(() =>
    describeRedirectDestination(getRedirectIntent()),
  );

  const getPasswordStrength = (pwd: string): PasswordStrength => {
    if (!pwd) return null;
    if (pwd.length < 6) return 'weak';
    if (pwd.length < 8) return 'fair';
    if (pwd.length < 12) return 'good';
    return 'strong';
  };

  const passwordStrength = activeTab === 'signup' ? getPasswordStrength(password) : null;

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
    // Move focus to the alert so keyboard / SR users hear failures immediately.
    errorRef.current?.focus();
  }, [error]);

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
      `}</style>

      {/* Left Column - Brand */}
      <div className="signin-left" style={{ flex: 1, background: '#1A1714', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem', position: 'relative' }}>
        {/* Top - Logo */}
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }} className="breathe" />
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#FAF7F4' }}>Arena</span>
        </div>

        {/* Middle - Content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ position: 'absolute', top: '-60px', left: '-20px', fontSize: '220px', fontWeight: 500, color: 'rgba(250,247,244,0.06)', pointerEvents: 'none', letterSpacing: '-0.06em', zIndex: 0 }}>4</div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(250,247,244,0.4)', marginBottom: '1rem' }}>Your thinking panel</p>
            <h1 style={{ fontSize: '42px', fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.1, color: '#FAF7F4', marginBottom: '1rem' }}>
              <span style={{ display: 'block' }}>Four minds.</span>
              <span style={{ display: 'block', color: '#C4956A', fontStyle: 'italic' }}>One account.</span>
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.5)', lineHeight: 1.7, maxWidth: '280px' }}>
              Save your history. Track your leaderboard. Keep your panel synced.
            </p>
          </div>
        </div>

        {/* Bottom - Agent Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[
            { name: 'The Analyst', color: '#8C9BAB', quote: 'I find the flaw in everything.' },
            { name: 'The Philosopher', color: '#9B8FAA', quote: 'I question the premise first.' },
            { name: 'The Pragmatist', color: '#8AA899', quote: 'I only care what works.' },
            { name: 'The Contrarian', color: '#B0977E', quote: 'I say what no one else will.' },
          ].map((agent) => (
            <div key={agent.name} style={{ background: 'rgba(250,247,244,0.05)', border: '0.5px solid rgba(250,247,244,0.1)', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '.4rem' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: agent.color }} className="breathe" />
                <span style={{ fontSize: '12px', color: 'rgba(250,247,244,0.6)' }}>{agent.name}</span>
              </div>
              <p style={{ fontSize: '11px', fontStyle: 'italic', color: 'rgba(250,247,244,0.35)', lineHeight: 1.4 }}>{agent.quote}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column - Form */}
      <div className="signin-right" style={{ flex: 1, background: '#FAF7F4', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
        <div className="signin-form-container" style={{ maxWidth: '380px', width: '100%' }}>
          <div className="signin-mobile-brand" style={{ display: 'none' }}>
            <div style={{
              width: 7, height: 7,
              borderRadius: '50%',
              background: '#C4956A',
              animation: 'breathe 2.4s ease-in-out infinite'
            }} />
            Arena
          </div>
          {/* Tab Switcher */}
          <div style={{ background: '#F0EBE3', borderRadius: '999px', padding: '4px', display: 'flex', gap: '4px', marginBottom: '2rem' }}>
            <button
              onClick={() => {
                setActiveTab('signin');
                setError('');
                setPassword('');
                setConfirmPassword('');
              }}
              style={{
                flex: 1,
                fontSize: '13px',
                padding: '8px 20px',
                borderRadius: '999px',
                background: activeTab === 'signin' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'signin' ? '#1A1714' : '#6B6460',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: activeTab === 'signin' ? '0 1px 4px rgba(26,23,20,0.08)' : 'none',
              }}
            >
              Sign in
            </button>
            <button
              onClick={() => {
                setActiveTab('signup');
                setError('');
                setName('');
                setPassword('');
                setConfirmPassword('');
              }}
              style={{
                flex: 1,
                fontSize: '13px',
                padding: '8px 20px',
                borderRadius: '999px',
                background: activeTab === 'signup' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'signup' ? '#1A1714' : '#6B6460',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: activeTab === 'signup' ? '0 1px 4px rgba(26,23,20,0.08)' : 'none',
              }}
            >
              Create account
            </button>
          </div>

          {/* Sign In Form */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn}>
              <h2 style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-.02em', color: '#1A1714', marginBottom: '.4rem' }}>Welcome back</h2>
              <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1rem' }}>Sign in to your Arena account</p>
              <p
                style={{
                  fontSize: 12,
                  color: '#8C7355',
                  marginBottom: '1.5rem',
                  padding: '10px 12px',
                  background: 'rgba(196,149,106,0.08)',
                  border: '0.5px solid rgba(196,149,106,0.25)',
                  borderRadius: 10,
                  lineHeight: 1.5,
                }}
              >
                After sign in you&apos;ll continue to <strong style={{ color: '#2C1810', fontWeight: 500 }}>{continueLabel}</strong>.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="signin-email" style={{ display: 'block', fontSize: '13px', color: '#6B5040', marginBottom: '.4rem' }}>Email</label>
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
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '16px',
                    color: '#1A1714',
                    outline: 'none',
                    transition: 'all 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,149,106,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                <label htmlFor="signin-password" style={{ display: 'block', fontSize: '13px', color: '#6B5040', marginBottom: '.4rem' }}>Password</label>
                <input
                  id="signin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    paddingRight: '40px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '16px',
                    color: '#1A1714',
                    outline: 'none',
                    transition: 'all 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,149,106,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(10%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? (
                    <EyeOff style={{ width: '16px', height: '16px', color: '#6B6460' }} />
                  ) : (
                    <Eye style={{ width: '16px', height: '16px', color: '#6B6460' }} />
                  )}
                </button>
              </div>

              {error ? (
                <p
                  ref={errorRef}
                  role="alert"
                  tabIndex={-1}
                  style={{
                    fontSize: '13px',
                    color: '#993C1D',
                    marginBottom: '1rem',
                    outline: 'none',
                    padding: '10px 12px',
                    background: 'rgba(153,60,29,0.06)',
                    borderRadius: 10,
                    border: '0.5px solid rgba(153,60,29,0.2)',
                  }}
                >
                  {error}
                </p>
              ) : null}

              <div style={{ marginBottom: '1.5rem' }}>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isLoading || authLoading}
                  disabled={isLoading || authLoading}
                  className="signin-submit"
                >
                  Sign in to Arena
                </Button>
              </div>

              <p style={{ fontSize: '12px', color: '#6B6460', textAlign: 'center', marginTop: '1.5rem' }}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signup');
                    setError('');
                    setName('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  style={{
                    color: '#C4956A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '12px',
                    textDecoration: 'underline',
                  }}
                >
                  Create one
                </button>
              </p>
            </form>
          )}

          {/* Sign Up Form */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUp}>
              <h2 style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-.02em', color: '#1A1714', marginBottom: '.4rem' }}>Create your account</h2>
              <p
                style={{
                  fontSize: 12,
                  color: '#8C7355',
                  marginBottom: '1.25rem',
                  padding: '10px 12px',
                  background: 'rgba(196,149,106,0.08)',
                  border: '0.5px solid rgba(196,149,106,0.25)',
                  borderRadius: 10,
                  lineHeight: 1.5,
                }}
              >
                After signup you&apos;ll continue to <strong style={{ color: '#2C1810', fontWeight: 500 }}>{continueLabel}</strong>.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="signup-name" style={{ display: 'block', fontSize: '13px', color: '#6B5040', marginBottom: '.4rem' }}>Name</label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '16px',
                    color: '#1A1714',
                    outline: 'none',
                    transition: 'all 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,149,106,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="signup-email" style={{ display: 'block', fontSize: '13px', color: '#6B5040', marginBottom: '.4rem' }}>Email</label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '16px',
                    color: '#1A1714',
                    outline: 'none',
                    transition: 'all 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,149,106,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div style={{ marginBottom: '.6rem', position: 'relative' }}>
                <label htmlFor="signup-password" style={{ display: 'block', fontSize: '13px', color: '#6B5040', marginBottom: '.4rem' }}>Password</label>
                <input
                  id="signup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    paddingRight: '40px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '16px',
                    color: '#1A1714',
                    outline: 'none',
                    transition: 'all 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,149,106,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(10%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? (
                    <EyeOff style={{ width: '16px', height: '16px', color: '#6B6460' }} />
                  ) : (
                    <Eye style={{ width: '16px', height: '16px', color: '#6B6460' }} />
                  )}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {passwordStrength && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem' }}>
                  {[1, 2, 3, 4].map((segment) => {
                    let isActive = false;
                    let color = '#F0EBE3';

                    if (passwordStrength === 'weak' && segment <= 1) {
                      isActive = true;
                      color = '#E57373';
                    } else if (passwordStrength === 'fair' && segment <= 2) {
                      isActive = true;
                      color = '#C4956A';
                    } else if (passwordStrength === 'good' && segment <= 3) {
                      isActive = true;
                      color = '#8AA899';
                    } else if (passwordStrength === 'strong' && segment <= 4) {
                      isActive = true;
                      color = '#8AA899';
                    }

                    return (
                      <div
                        key={segment}
                        style={{
                          flex: 1,
                          height: '3px',
                          borderRadius: '999px',
                          background: isActive ? color : '#F0EBE3',
                          transition: 'all 200ms ease',
                        }}
                      />
                    );
                  })}
                </div>
              )}

              <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                <label htmlFor="signup-confirm" style={{ display: 'block', fontSize: '13px', color: '#6B5040', marginBottom: '.4rem' }}>Confirm password</label>
                <input
                  id="signup-confirm"
                  name="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    paddingRight: '40px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '16px',
                    color: '#1A1714',
                    outline: 'none',
                    transition: 'all 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,149,106,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(10%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showConfirmPassword ? (
                    <EyeOff style={{ width: '16px', height: '16px', color: '#6B6460' }} />
                  ) : (
                    <Eye style={{ width: '16px', height: '16px', color: '#6B6460' }} />
                  )}
                </button>
              </div>

              <p style={{ fontSize: '11px', color: '#6B6460', marginTop: '4px', marginBottom: '1rem' }}>
                Min 8 characters · One uppercase · One number
              </p>

              {error && (
                <p style={{ fontSize: '13px', color: '#993C1D', marginBottom: '1rem' }}>{error}</p>
              )}

              <div style={{ marginBottom: '1.5rem' }}>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isLoading || authLoading}
                  disabled={isLoading || authLoading}
                  className="signin-submit"
                >
                  Create your account
                </Button>
              </div>

              <p style={{ fontSize: '12px', color: '#6B6460', textAlign: 'center', marginTop: '1.5rem' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setError('');
                    setName('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  style={{
                    color: '#C4956A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '12px',
                    textDecoration: 'underline',
                  }}
                >
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
