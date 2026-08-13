import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, ShieldCheck, RefreshCw, Layers } from 'lucide-react';

const Github = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.width || 24}
    height={props.height || 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={props.style}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function Auth() {
  const { login, signup, sendCode, loginWithGithub, loginWithToken, user, API_URL } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    // Redirect if already logged in
    if (user) {
      navigate('/dashboard');
      return;
    }

    // Check for GitHub Callback parameters.
    // The real OAuth flow now completes on the server and redirects back with a
    // signed token; mock_github stays for the offline developer shortcut.
    const tokenParam = searchParams.get('token');
    const mockParam = searchParams.get('mock_github');

    if (tokenParam || mockParam === 'true') {
      const handleGithubAuth = async () => {
        setOauthLoading(true);
        setMessage({ text: 'Authenticating with GitHub...', type: 'info' });
        try {
          if (tokenParam) {
            await loginWithToken(tokenParam);
          } else {
            await loginWithGithub('mock_code', true);
          }
          setMessage({ text: 'GitHub Authentication successful!', type: 'success' });
          setTimeout(() => navigate('/dashboard'), 1000);
        } catch (error) {
          setMessage({ text: error.message || 'GitHub Authentication failed', type: 'error' });
        } finally {
          setOauthLoading(false);
        }
      };
      handleGithubAuth();
    }
  }, [searchParams, user, navigate]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setMessage({ text: '', type: '' });
    try {
      await sendCode(email);
      setCodeSent(true);
      setMessage({ text: 'Verification code sent to email! (If offline, check server console logs)', type: 'success' });
    } catch (error) {
      setMessage({ text: error.message || 'Failed to send verification code', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !code) return;
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      if (isSignUp) {
        await signup(email, code);
        setMessage({ text: 'Signup successful! Toggling to sign in.', type: 'success' });
        setIsSignUp(false);
        setCode('');
        setCodeSent(false);
      } else {
        await login(email, code);
        setMessage({ text: 'Signed in successfully!', type: 'success' });
        setTimeout(() => navigate('/dashboard'), 800);
      }
    } catch (error) {
      setMessage({ text: error.message || 'Authentication failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleGithubClick = () => {
    // Redirect user to backend github login
    window.location.href = `${API_URL}/auth/github`;
  };

  const handleMockGithubClick = async () => {
    setOauthLoading(true);
    setMessage({ text: 'Simulating GitHub Developer login...', type: 'info' });
    try {
      await loginWithGithub('mock_developer_code', true);
      setMessage({ text: 'Mock GitHub login successful!', type: 'success' });
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (error) {
      setMessage({ text: error.message || 'Mock GitHub Login failed', type: 'error' });
    } finally {
      setOauthLoading(false);
    }
  };

  if (oauthLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card glass-panel" style={{ textAlign: 'center' }}>
          <Layers style={{ width: 48, height: 48, color: 'var(--accent-primary)', marginBottom: 24 }} />
          <h2>Authentication Processing</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-logo">
          <Layers style={{ width: 32, height: 32, color: 'var(--accent-primary)' }} />
          <span>Mini Trello</span>
        </div>
        <p className="auth-subtitle">
          {isSignUp ? 'Create an account to manage your projects' : 'Sign in to access your boards'}
        </p>

        {message.text && (
          <div style={{
            padding: '12px',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: '13px',
            marginBottom: '20px',
            background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.2)' : message.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'}`,
            color: message.type === 'success' ? '#a7f3d0' : message.type === 'error' ? '#fca5a5' : '#c7d2fe'
          }}>
            {message.text}
          </div>
        )}

        <form onSubmit={codeSent ? handleSubmit : handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="email">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                id="email"
                type="email"
                required
                disabled={codeSent}
                placeholder="developer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '40px' }}
              />
              <Mail style={{ position: 'absolute', left: '14px', top: '12px', width: '16px', height: '16px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {codeSent && (
            <div>
              <label htmlFor="code">Verification Code</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="code"
                  type="text"
                  required
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ paddingLeft: '40px', letterSpacing: '2px', fontWeight: 'bold' }}
                />
                <ShieldCheck style={{ position: 'absolute', left: '14px', top: '12px', width: '16px', height: '16px', color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          {!codeSent ? (
            <button type="submit" disabled={loading} className="primary">
              {loading ? <RefreshCw className="animate-spin" style={{ width: 16, height: 16 }} /> : 'Send Verification Code'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={loading} className="primary" style={{ flex: 1 }}>
                {isSignUp ? 'Register Account' : 'Verify & Sign In'}
              </button>
              <button type="button" onClick={() => setCodeSent(false)} className="secondary">
                Edit Email
              </button>
            </div>
          )}
        </form>

        <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Or authenticate with</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button type="button" onClick={handleGithubClick} className="secondary" style={{ width: '100%' }}>
            <Github style={{ width: 16, height: 16 }} />
            Sign in with GitHub
          </button>

          <button type="button" onClick={handleMockGithubClick} className="secondary" style={{ width: '100%', borderColor: 'rgba(99, 102, 241, 0.25)', background: 'rgba(99, 102, 241, 0.05)' }}>
            <Github style={{ width: 16, height: 16, color: 'var(--accent-primary)' }} />
            Developer Mock Sign-in
          </button>
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setCodeSent(false);
              setCode('');
              setMessage({ text: '', type: '' });
            }}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-primary)', fontSize: '13px', fontWeight: 'bold' }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
