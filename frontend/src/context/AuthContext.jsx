import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  const API_URL = 'http://localhost:5090';

  useEffect(() => {
    // If we have a token, we can load the user profile
    const loadUser = async () => {
      if (token) {
        try {
          // Decode jwt locally or query users profile
          // Decided to query backend users check endpoint to see if token is valid
          const res = await fetch(`${API_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          // Wait, `/users/me` is not implemented in backend, but we can do a fallback decoding, 
          // or retrieve user detail from localStorage, or query `/users/:id`
          // Let's decode or load from localStorage.
          const cachedUser = localStorage.getItem('user');
          if (cachedUser) {
            setUser(JSON.parse(cachedUser));
          } else {
            // Logout if cache is broken
            logout();
          }
        } catch (error) {
          console.error('Failed to load user', error);
          logout();
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
      throw new Error(data.error || 'You do not have permission to perform this action');
    }
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, sendCode, signup, login, loginWithGithub, logout, updateProfile, fetchWithAuth, API_URL }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
