import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { login, register } from '../api';
import { useAuth } from '../hooks/useAuth';

type Tab = 'signin' | 'signup';
type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | null;

export function SignInPage() {
  const navigate = useNavigate();
  const { setUser, setIsAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const getPasswordStrength = (pwd: string): PasswordStrength => {
    if (!pwd) return null;
    if (pwd.length < 6) return 'weak';
    if (pwd.length < 8) return 'fair';
    if (pwd.length < 12) return 'good';
    return 'strong';
  };

  const passwordStrength = activeTab === 'signup' ? getPasswordStrength(password) : null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const signedInUser = await login(email, password);
      console.log('SignInPage received user:', JSON.stringify(signedInUser));
      console.log('User has id?', signedInUser?.id);
      console.log('User has email?', signedInUser?.email);
      setUser(signedInUser);
      setIsAuthenticated(true);
      const redirect = sessionStorage.getItem('redirectAfterLogin') || '/app';
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(redirect);
    } catch (err) {
      console.log('SignInPage caught error:', err);
      console.log('Error message:', err instanceof Error ? err.message : 'Sign in failed');
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const registeredUser = await register(email, password);
      setUser(registeredUser);
      setIsAuthenticated(true);
      const redirect = sessionStorage.getItem('redirectAfterLogin') || '/app';
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed');
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
      <div style={{ flex: 1, background: '#1A1714', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem', position: 'relative' }}>
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
      <div style={{ flex: 1, background: '#FAF7F4', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
        <div style={{ maxWidth: '380px', width: '100%' }}>
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
              <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '2rem' }}>Sign in to your Arena account</p>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6460', marginBottom: '.4rem' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '14px',
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
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6460', marginBottom: '.4rem' }}>Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
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
                    fontSize: '14px',
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

              {error && (
                <p style={{ fontSize: '12px', color: '#E57373', marginBottom: '1rem' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '999px',
                  background: '#1A1714',
                  color: '#FAF7F4',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 150ms ease',
                  marginBottom: '1.5rem',
                  opacity: isLoading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => !isLoading && (e.currentTarget.style.opacity = '1')}
                className={isLoading ? 'pulse' : ''}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>

              <p style={{ fontSize: '12px', color: '#6B6460', textAlign: 'center', marginTop: '1.5rem' }}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signup');
                    setError('');
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
              <p style={{ fontSize: '13px', color: '#C4956A', marginBottom: '2rem' }}>Free forever. No credit card needed.</p>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6460', marginBottom: '.4rem' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '0.5px solid #E0D8D0',
                    background: '#FFFFFF',
                    fontSize: '14px',
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
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6460', marginBottom: '.4rem' }}>Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
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
                    fontSize: '14px',
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
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6460', marginBottom: '.4rem' }}>Confirm password</label>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
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
                    fontSize: '14px',
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
                <p style={{ fontSize: '12px', color: '#E57373', marginBottom: '1rem' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '999px',
                  background: '#1A1714',
                  color: '#FAF7F4',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 150ms ease',
                  marginBottom: '1.5rem',
                  opacity: isLoading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => !isLoading && (e.currentTarget.style.opacity = '1')}
                className={isLoading ? 'pulse' : ''}
              >
                {isLoading ? 'Creating account...' : 'Create account'}
              </button>

              <p style={{ fontSize: '12px', color: '#6B6460', textAlign: 'center', marginTop: '1.5rem' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setError('');
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
