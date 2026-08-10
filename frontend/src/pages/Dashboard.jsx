import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Link } from 'react-router-dom';
// Bỏ LayoutGrid khỏi lucide-react nếu không dùng nữa
import { Plus, Calendar, MailOpen, Check, X, FolderOpen, LogOut, User } from 'lucide-react';

// Sửa lại cú pháp import ảnh (Bỏ dấu ngoặc nhọn {})
import TrelloLogo from '../assets/Trello-logo.png';


export default function Dashboard() {
  const { user, logout, fetchWithAuth } = useAuth();
  const socket = useSocket();

  const [boards, setBoards] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      // Fetch Boards
      const boardsRes = await fetchWithAuth('/boards');
      const boardsData = await boardsRes.json();
      setBoards(boardsData);

      // Fetch pending invitations
      const invitesRes = await fetchWithAuth('/boards/invitations/pending');
      const invitesData = await invitesRes.json();
      setInvitations(invitesData);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Socket notification listener for incoming invites
  useEffect(() => {
    if (!socket) return;

    socket.on('invitation_received', (invitation) => {
      // Reload invitations list
      loadData();
    });

    return () => {
      socket.off('invitation_received');
    };
  }, [socket]);

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    try {
      const res = await fetchWithAuth('/boards', {
        method: 'POST',
        body: JSON.stringify({ name: newBoardName, description: newBoardDesc })
      });
      const data = await res.json();
      setBoards([data, ...boards]);
      setNewBoardName('');
      setNewBoardDesc('');
      setShowAddBoard(false);
    } catch (err) {
      console.error('Failed to create board', err);
    }
  };

  const handleResolveInvite = async (invite, status) => {
    try {
      // The server derives the member from the authenticated user, so no member_id is sent
      const res = await fetchWithAuth(`/boards/${invite.boardId}/invite/accept`, {
        method: 'POST',
        body: JSON.stringify({
          invite_id: invite.id,
          status
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to resolve invitation');
      }
      // Reload boards and invitations
      loadData();
    } catch (err) {
      console.error('Failed to resolve invitation', err);
      alert(err.message || 'Failed to resolve invitation');
    }
  };

  const filteredBoards = boards.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="app-layout">
      {/* Header bar */}
      <header className="app-header">
        <Link to="/" className="logo">
          <img src={TrelloLogo} alt="Trello Logo" style={{ width: 40, height: 45, objectFit: 'contain' }} />
          <span>Lulu Trello</span>
        </Link>
        <div className="header-actions">
          <Link to="/profile" className="user-badge">
            <img src={user?.avatarUrl} alt="Avatar" className="user-avatar" />
            <span>{user?.name}</span>
          </Link>
          <button onClick={logout} className="secondary" style={{ padding: '8px 12px' }}>
            <LogOut style={{ width: 15, height: 15 }} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="dashboard-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' }}>Your Workspaces</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>Access your boards and team tasks</p>
          </div>
          <button onClick={() => setShowAddBoard(true)} className="primary">
            <Plus style={{ width: 18, height: 18 }} />
            Create Board
          </button>
        </div>

        {/* Search & Stats Bar */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '35px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: '360px', flex: 1 }}
          />
        </div>

        {/* Invitations Alert Section */}
        {invitations.length > 0 && (
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px', borderLeft: '4px solid var(--accent-primary)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MailOpen style={{ color: 'var(--accent-primary)', width: 18, height: 18 }} />
              Workspace Invitations ({invitations.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {invitations.map(invite => (
                <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ fontWeight: '700', color: '#fff' }}>{invite.ownerName}</span>
                    <span style={{ color: 'var(--text-secondary)' }}> invited you to collaborate on the board </span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-primary)' }}>{invite.boardName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleResolveInvite(invite, 'accepted')} className="primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      <Check style={{ width: 14, height: 14 }} />
                      Accept
                    </button>
                    <button onClick={() => handleResolveInvite(invite, 'declined')} className="danger" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      <X style={{ width: 14, height: 14 }} />
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Boards Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Loading workspaces...</p>
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 40px', borderStyle: 'dashed' }}>
            {/* THAY THẾ LAYOUTGRID BẰNG HÌNH ẢNH Ở ĐÂY */}
            <img 
              src={TrelloLogo} 
              alt="Empty Workspace" 
              style={{ width: 48, height: 48, objectFit: 'contain', margin: '0 auto 16px', display: 'block' }} 
            />
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>No boards found</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', maxWidth: '320px', margin: '8px auto 24px' }}>
              Create your first board to start tracking tasks and collaborating with your team.
            </p>
            <button onClick={() => setShowAddBoard(true)} className="primary">
              <Plus style={{ width: 18, height: 18 }} />
              Create Board
            </button>
          </div>
        ) : (
          <div className="boards-grid">
            {filteredBoards.map(board => (
              <Link to={`/boards/${board.id}`} key={board.id} className="board-card glass-panel">
                <div>
                  <h3>{board.name}</h3>
                  <p>{board.description || 'No description provided.'}</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar style={{ width: 12, height: 12 }} />
                    Active Workspace
                  </span>
                  <span>{board.members?.length || 1} {board.members?.length === 1 ? 'member' : 'members'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Create Board Modal Overlay */}
      {showAddBoard && (
        <div className="modal-overlay" onClick={() => setShowAddBoard(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '24px' }}>Create Workspace Board</h2>
            <form onSubmit={handleCreateBoard} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="board-name">Board Name</label>
                <input
                  id="board-name"
                  type="text"
                  required
                  placeholder="e.g. Marketing Launch, Software Sprint"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="board-desc">Description</label>
                <textarea
                  id="board-desc"
                  rows="3"
                  placeholder="Describe the purpose of this board..."
                  value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowAddBoard(false)} className="secondary">
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}