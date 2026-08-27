import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Shield, Sparkles, LayoutGrid } from 'lucide-react';
import TrelloLogo from '../assets/Trello-logo.png';
import TacoMascot from '../components/TacoMascot';
import MaintenanceNotice from '../components/MaintenanceNotice';

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

export default function Landing() {
  return (
    <div className="app-layout" style={{ minHeight: '100vh', justifyContent: 'center' }}>

      {/* Greets the first visit of the tab, then gets out of the way */}
      <MaintenanceNotice />

      {/* Navbar header */}
      <header className="app-header" style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'transparent', borderBottom: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={TrelloLogo} alt="Mino Trello Logo" style={{ width: 36, height: 40, objectFit: 'contain' }} />
          <span style={{ fontSize: '20px', fontWeight: '800', tracking: '0.5px' }}>Lulu Trello</span>
        </div>
        <div>
          <Link to="/auth" className="user-badge" style={{ padding: '8px 20px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '30px' }}>
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ maxWidth: '1200px', width: '100%', margin: '120px auto 60px', padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>

        {/* Responsive Hero Section */}
        <div className="hero-grid">
          <div className="hero-left">
            {/* Glow Tagline Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              background: 'var(--accent-primary-glow)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '30px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: '0 0 15px rgba(99, 102, 241, 0.1)'
            }}>
              <Sparkles style={{ width: 14, height: 14, color: 'var(--accent-white)' }} />
              Introducing Real-Time Workspace Collaboration
            </div>

            {/* Hero Title */}
            <h1 style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: '900',
              lineHeight: '1.2',
              maxWidth: '650px',
              background: 'linear-gradient(135deg, #ffffff 30%, #a1a3a8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-1px'
            }}>
              Manage your tasks cleanly with <span style={{ background: 'linear-gradient(135deg, #8f9afaff, #c084fc, #fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Lulu Trello</span>
            </h1>

            {/* Hero Description */}
            <p style={{
              fontSize: 'clamp(15px, 1.8vw, 17px)',
              color: 'var(--text-secondary)',
              maxWidth: '580px',
              lineHeight: '1.6'
            }}>
              A lightweight, premium real-time Kanban board management system. Drag tasks between columns, invite team members, and link your GitHub repositories automatically.
            </p>

            {/* Start Button */}
            <div style={{ marginTop: '8px' }}>
              <Link to="/dashboard" style={{ textDecoration: 'none' }}>
                <button className="btnStart" style={{
                  padding: '16px 36px',
                  fontSize: '16px',
                  borderRadius: '30px',
                  fontWeight: '700',
                  boxShadow: '0 10px 25px rgba(63, 63, 64, 0.45)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  Start in Lulu Trello
                  <ArrowRight style={{ width: 18, height: 18 }} />
                </button>
              </Link>
            </div>
          </div>

          <div className="hero-right">
            <TacoMascot width={400} height={478} />
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          width: '100%',
          marginTop: '60px'
        }}>
          
          {/* Card 1: Kanban Board */}
          <div className="glass-panel" style={{ padding: '32px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)'
            }}>
              <LayoutGrid style={{ width: 20, height: 20 }} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800' }}>Kanban Workspace</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
              Organize projects in clean card lists. Drag tasks dynamically between stages and track progress in real-time.
            </p>
          </div>

          {/* Card 2: GitHub Integration */}
          <div className="glass-panel" style={{ padding: '32px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(236, 72, 153, 0.1)',
              border: '1px solid rgba(236, 72, 153, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-secondary)'
            }}>
              <Github style={{ width: 20, height: 20 }} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800' }}>GitHub Integrator</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
              Connect repositories to search branches, commits, PRs, or issues and attach them directly to task details.
            </p>
          </div>

          {/* Card 3: Real-Time Sockets */}
          <div className="glass-panel" style={{ padding: '32px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-success)'
            }}>
              <Shield style={{ width: 20, height: 20 }} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800' }}>Secure & Real-Time</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
              Powered by Socket.io to keep columns synchronized instantly. Secure passwordless email authentication.
            </p>
          </div>

        </div>

        {/* Simple Footer list */}
        <div style={{
          marginTop: '80px',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '32px',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          fontSize: '13px',
          color: 'var(--text-secondary)'
        }}>
          <span>&copy; {new Date().getFullYear()} Lulu Trello App. All rights reserved.</span>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
             Designed by Nguyen Thanh Luan
            </span>
          </div>
        </div>

      </main>
    </div>
  );
}

