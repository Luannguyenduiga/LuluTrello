import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5090';

  useEffect(() => {
    // Ask the server who this token belongs to. This both validates the token
    // and refreshes the cached profile; an expired token now logs out on load
    // instead of leaving a stale session that fails on the first API call.
    const loadUser = async () => {
      if (token) {
        try {
          const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const profile = await res.json();
            setUser(profile);
            localStorage.setItem('user', JSON.stringify(profile));
          } else {
            logout();
          }
        } catch (error) {
          // Network failure: keep the cached profile so a flaky connection
          // does not sign the user out
          console.error('Failed to load user', error);
          const cachedUser = localStorage.getItem('user');
          if (cachedUser) setUser(JSON.parse(cachedUser));
          else logout();
        }
      }
      setLoading(false);
    };
    loadUser();
  }, [token]);

  const sendCode = async (email) => {
    const res = await fetch(`${API_URL}/auth/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
    return data;
  };

  const signup = async (email, verificationCode) => {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, verificationCode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    return data;
  };

  const login = async (email, verificationCode) => {
    const res = await fetch(`${API_URL}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, verificationCode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign in failed');
    
    setToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  };

  const loginWithGithub = async (code, isMock = false) => {
    const res = await fetch(`${API_URL}/auth/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, isMock })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'GitHub login failed');

    setToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  };

  /**
   * Completes the GitHub redirect flow: the server signed us in and handed the
   * token back in the URL, so exchange it for the profile and open the session.
   */
  const loginWithToken = async (accessToken) => {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('GitHub sign-in failed');

    const profile = await res.json();
    setToken(accessToken);
    setUser(profile);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(profile));
    return profile;
  };

  const updateProfile = async (updatedData) => {
    if (!user || !token) return;
    const res = await fetch(`${API_URL}/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updatedData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');

    setUser(data);
    localStorage.setItem('user', JSON.stringify(data));
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const fetchWithAuth = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    const res = await fetch(`${API_URL}${url}`, { ...options, headers });

    // 401 means the token is missing/invalid -> the session really is over.
    // 403 only means "you lack permission for this action", so keep the session
    // and let the caller surface the message instead of logging the user out.
    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }
    if (res.status === 403) {
      const data = await res.clone().json().catch(() => ({}));
      // Nest puts the reason in `message`, which is an array for validation errors
      const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      throw new Error(detail || data.error || 'You do not have permission to perform this action');
    }
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, sendCode, signup, login, loginWithGithub, loginWithToken, logout, updateProfile, fetchWithAuth, API_URL }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
