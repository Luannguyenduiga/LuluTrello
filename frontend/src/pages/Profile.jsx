import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, Shield, Check, RefreshCw, Users, BadgeCheck } from 'lucide-react';

export default function Profile() {
  const { user, updateProfile, fetchWithAuth } = useAuth();

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // List of all registered users
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setAvatarUrl(user.avatarUrl || '');
    }
    loadAllUsers();
  }, [user]);

  const loadAllUsers = async () => {
    try {
      const res = await fetchWithAuth('/users');
      const data = await res.json();
      setAllUsers(data);
    } catch (err) {
      console.error('Failed to load registered users', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMessage({ text: '', type: '' });

    try {
      await updateProfile({ name, avatarUrl });
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to update profile', type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Header bar */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link to="/dashboard" className="logo">
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </Link>
          <span style={{ fontSize: '18px', fontWeight: '800' }}>Account Settings</span>
        </div>
      </header>

      {/* Profile workspace */}
      <main className="dashboard-content" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '40px', flexWrap: 'wrap' }}>
        
        {/* Profile edit card */}
        <div className="glass-panel" style={{ padding: '32px', height: 'fit-content' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User style={{ color: 'var(--accent-primary)', width: 20, height: 20 }} />
            Profile Details
          </h2>

          {message.text && (
            <div style={{
              padding: '12px',
              borderRadius: 'var(--border-radius-sm)',
              fontSize: '13px',
              marginBottom: '20px',
              background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: message.type === 'success' ? '#a7f3d0' : '#fca5a5'
            }}>
              {message.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <img
              src={avatarUrl || 'https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=Felix'}
              alt="Avatar Preview"
              style={{ width: 90, height: 90, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '3px solid var(--accent-primary)', padding: '4px' }}
            />
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>{user?.name}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
                <Mail style={{ width: 12, height: 12 }} />
                {user?.email}
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="user-name">Full Name</label>
              <input
                id="user-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="user-avatar">Avatar URL</label>
              <input
                id="user-avatar"
                type="text"
                placeholder="https://example.com/avatar.png"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>

            <button type="submit" disabled={updating} className="primary" style={{ marginTop: '8px' }}>
              {updating ? <RefreshCw className="animate-spin" style={{ width: 16, height: 16 }} /> : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* User directory */}
        <div className="glass-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users style={{ color: 'var(--accent-primary)', width: 20, height: 20 }} />
            Registered Team Members ({allUsers.length})
          </h2>

          {usersLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading directory...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '450px', overflowY: 'auto', paddingRight: '6px' }}>
              {allUsers.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={u.avatarUrl} alt={u.name} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-tertiary)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {u.name}
                        {u.id === user?.id && <span style={{ fontSize: '9px', background: 'var(--accent-primary-glow)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--accent-primary)', padding: '1px 5px', borderRadius: '10px' }}>You</span>}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{u.email}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
