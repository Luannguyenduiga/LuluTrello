import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ArrowLeft, Plus, Users, Trash, Edit3, Settings, Check, AlertCircle, PlusCircle, UserPlus, UserMinus, Calendar, Info, Presentation } from 'lucide-react';
import TaskModal from '../components/TaskModal';
import DeckModal from '../components/DeckModal';

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

export default function BoardDetail() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { user, fetchWithAuth } = useAuth();
  const socket = useSocket();

  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const [tasks, setTasks] = useState({}); // cardId -> [tasks]
  const [boardMembers, setBoardMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState('');


  // Modals / Dialog UI
  const [showMembers, setShowMembers] = useState(false);
  const membersRef = useRef(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [showEditBoard, setShowEditBoard] = useState(false);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');

  // Selected Task for Details Modal
  const [activeTask, setActiveTask] = useState(null);
  const [activeCardId, setActiveCardId] = useState('');

  // A passed deadline only matters while the task is still open, so a late task
  // that finally reached Done stops being flagged.
  const isOverdue = (task) => {
    if (!task.dueDate || task.status === 'Done') return false;
    const due = new Date(task.dueDate);
    return !Number.isNaN(due.getTime()) && due < new Date();
  };

  // Roles a person can be invited as, in order of decreasing power
  const ROLE_OPTIONS = [
    { value: 'leader', label: 'Leader', hint: 'Can also edit board settings' },
    { value: 'member', label: 'Member', hint: 'Can create and edit tasks' },
    { value: 'viewer', label: 'Viewer', hint: 'Read-only access' }
  ];

  // Role of any board participant. The server sends its own verdict in board.role
  // for the current user; board.roles holds everyone else.
  const roleOf = (userId) => {
    if (!board || !userId) return null;
    if (board.ownerId === userId) return 'owner';
    return board.roles?.[userId] || 'member';
  };

  const myRole = board ? (board.role || roleOf(user?.id)) : null;
  const isOwner = myRole === 'owner';
  const canManageBoard = myRole === 'owner' || myRole === 'leader';  // board settings
  const canEditContent = canManageBoard || myRole === 'member';      // cards & tasks
  // Mirrors SlidesAccessGuard: whoever manages the board, plus the administrators
  // in ADMIN_EMAILS. Members may upload the sources but not build the deck.
  const canBuildDeck = canManageBoard || isAdmin;

  // Mirrors the server rules in boards.service.removeMember, so the UI never
  // offers a button that the API would answer with a 400 or 403.
  const canRemoveMember = (memberId) => {
    if (!canManageBoard) return false;
    if (memberId === board?.ownerId) return false;  // the owner is permanent
    if (memberId === user?.id) return false;        // leaving is not this action
    return isOwner || roleOf(memberId) !== 'leader'; // only the owner drops leaders
  };

  // Drag states
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [sourceCardId, setSourceCardId] = useState(null);
  const [dragOverCardId, setDragOverCardId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null); // Optional column-specific status drop

  // Load board details, users list, board members, card columns, and tasks
  const loadBoardData = async () => {
    try {
      const boardRes = await fetchWithAuth(`/boards/${boardId}`);
      if (!boardRes.ok) {
        navigate('/');
        return;
      }
      const boardData = await boardRes.json();
      setBoard(boardData);
      setEditBoardName(boardData.name);
      setEditBoardDesc(boardData.description);

      // Load all system users (to invite)
      const usersRes = await fetchWithAuth('/users');
      const usersData = await usersRes.json();
      setAllUsers(usersData);

      // Filter board members details
      const membersDetails = usersData.filter(u => boardData.members?.includes(u.id));
      setBoardMembers(membersDetails);

      // Load cards
      const cardsRes = await fetchWithAuth(`/boards/${boardId}/cards`);
      const cardsData = await cardsRes.json();
      setCards(cardsData);

      if (cardsData.length > 0) {
        setSelectedCardId(prev => prev || cardsData[0].id);
      }


      // Load tasks for each card
      const tasksMap = {};
      for (const card of cardsData) {
        const tasksRes = await fetchWithAuth(`/boards/${boardId}/cards/${card.id}/tasks`);
        const tasksData = await tasksRes.json();
        tasksMap[card.id] = tasksData;
      }
      setTasks(tasksMap);
    } catch (err) {
      console.error('Failed to load board details', err);
      // Losing access to the board (removed from members, board deleted) makes
      // this page unusable, so send the user back to their dashboard.
      if (err.message?.includes('permission')) {
        navigate('/');
      }
    }
  };

  useEffect(() => {
    loadBoardData();
  }, [boardId]);

  // Whether this account is listed in ADMIN_EMAILS, which is what lets someone
  // other than the owner build a deck. A failure here just means "not an admin".
  useEffect(() => {
    fetchWithAuth('/admin/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  // Close the member dropdown when clicking outside of it or pressing Escape
  useEffect(() => {
    if (!showMembers) return;

    const handleClickOutside = (e) => {
      if (membersRef.current && !membersRef.current.contains(e.target)) {
        setShowMembers(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowMembers(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showMembers]);

  // Connect sockets and listen to changes
  useEffect(() => {
    if (!socket || !boardId) return;

    socket.emit('join_board', { boardId });

    // Handle real-time triggers from other users
    socket.on('board_updated', ({ name, description }) => {
      setBoard(prev => prev ? { ...prev, name, description } : null);
    });

    socket.on('board_deleted', () => {
      navigate('/');
    });

    socket.on('card_created', () => loadBoardData());
    socket.on('card_updated', () => loadBoardData());
    socket.on('card_deleted', () => loadBoardData());

    socket.on('task_created', (task) => {
      setTasks(prev => {
        const list = prev[task.cardId] || [];
        if (list.some(t => t.id === task.id)) return prev;
        return {
          ...prev,
          [task.cardId]: [...list, task]
        };
      });
    });

    socket.on('task_updated', (task) => {
      // Refresh board tasks completely to handle shifts between cards
      loadBoardData();
    });

    socket.on('task_deleted', ({ id }) => {
      setTasks(prev => {
        const updated = {};
        Object.keys(prev).forEach(cardId => {
          updated[cardId] = prev[cardId].filter(t => t.id !== id);
        });
        return updated;
      });
    });

    socket.on('invitation_resolved', () => {
      loadBoardData();
    });

    socket.on('member_removed', () => {
      loadBoardData();
    });

    // Sent to the removed user's own room: the board is gone for them, so leave
    // the page instead of letting every following request fail with a 403.
    socket.on('board_access_revoked', ({ boardId: revokedBoardId, boardName }) => {
      if (revokedBoardId !== boardId) return;
      alert(`You have been removed from "${boardName}".`);
      navigate('/');
    });

    return () => {
      socket.emit('leave_board', { boardId });
      socket.off('board_updated');
      socket.off('board_deleted');
      socket.off('card_created');
      socket.off('card_updated');
      socket.off('card_deleted');
      socket.off('task_created');
      socket.off('task_updated');
      socket.off('task_deleted');
      socket.off('invitation_resolved');
      socket.off('member_removed');
      socket.off('board_access_revoked');
    };
  }, [socket, boardId]);

  // Card Column actions
  const handleCreateCard = async (e) => {
    e.preventDefault();
    if (!newCardName.trim()) return;

    try {
      await fetchWithAuth(`/boards/${boardId}/cards`, {
        method: 'POST',
        body: JSON.stringify({ name: newCardName })
      });
      setNewCardName('');
      setShowAddCard(false);
      loadBoardData();
    } catch (err) {
      console.error('Failed to create card column', err);
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Are you sure you want to delete this column and all its tasks?')) return;
    try {
      await fetchWithAuth(`/boards/${boardId}/cards/${cardId}`, {
        method: 'DELETE'
      });
      loadBoardData();
    } catch (err) {
      console.error('Failed to delete card column', err);
    }
  };

  // Task Actions
  const handleAddTask = async (cardId, title) => {
    if (!title.trim()) return;
    try {
      const res = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, status: 'Icebox' })
      });
      const data = await res.json();
      setTasks(prev => ({
        ...prev,
        [cardId]: [...(prev[cardId] || []), data]
      }));
    } catch (err) {
      console.error('Failed to add task', err);
    }
  };

  // Drag and Drop implementation
  const handleDragStart = (e, taskId, cardId) => {
    setDraggedTaskId(taskId);
    setSourceCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    
    // Add dragging class
    setTimeout(() => {
      const el = document.getElementById(`task-${taskId}`);
      if (el) el.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (e, taskId) => {
    setDraggedTaskId(null);
    setSourceCardId(null);
    setDragOverCardId(null);
    setDragOverStatus(null);
    const el = document.getElementById(`task-${taskId}`);
    if (el) el.classList.remove('dragging');
  };

  const handleDragOverColumn = (e, cardId, status = null) => {
    e.preventDefault();
    setDragOverCardId(cardId);
    setDragOverStatus(status);
  };

  const handleDrop = async (e, targetCardId, targetStatus) => {
    e.preventDefault();
    if (!draggedTaskId || !sourceCardId) return;

    // Check if anything has changed (different card column or different status within card)
    const taskList = tasks[sourceCardId] || [];
    const task = taskList.find(t => t.id === draggedTaskId);
    if (!task) return;

    const isDifferentCard = targetCardId !== sourceCardId;
    const isDifferentStatus = targetStatus && task.status !== targetStatus;

    if (isDifferentCard || isDifferentStatus) {
      try {
        // Optimistically update UI
        setTasks(prev => {
          const srcList = prev[sourceCardId].filter(t => t.id !== draggedTaskId);
          const updatedTask = { ...task, cardId: targetCardId, status: targetStatus || task.status };
          const destList = [...(prev[targetCardId] || [])];
          
          // Avoid duplicate insertion
          if (!destList.some(t => t.id === draggedTaskId)) {
            destList.push(updatedTask);
          } else {
            const idx = destList.findIndex(t => t.id === draggedTaskId);
            destList[idx] = updatedTask;
          }

          return {
            ...prev,
            [sourceCardId]: srcList,
            [targetCardId]: destList
          };
        });

        // Trigger PUT request to update task status/card
        await fetchWithAuth(`/boards/${boardId}/cards/${sourceCardId}/tasks/${draggedTaskId}`, {
          method: 'PUT',
          body: JSON.stringify({
            id: draggedTaskId,
            card_id: targetCardId,
            status: targetStatus || task.status
          })
        });
      } catch (err) {
        console.error('Failed to move task', err);
        loadBoardData(); // Revert on failure
      }
    }

    setDraggedTaskId(null);
    setSourceCardId(null);
    setDragOverCardId(null);
    setDragOverStatus(null);
  };

  // Workspace Invite
  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() && !inviteUserId) return;

    try {
      // Only send the field that was actually filled in: an empty string is not a
      // valid email and the API rejects it, even though the field is optional.
      const payload = { role: inviteRole };
      if (inviteUserId) payload.member_id = inviteUserId;
      else if (inviteEmail.trim()) payload.email_member = inviteEmail.trim();

      const res = await fetchWithAuth(`/boards/${boardId}/invite`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Nest reports validation failures as `message`, which may be an array
        const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        throw new Error(detail || data.error || 'Failed to send invitation');
      }
      setInviteEmail('');
      setInviteUserId('');
      setInviteRole('member');
      setShowInviteModal(false);
      alert('Invitation sent successfully!');
    } catch (err) {
      console.error('Failed to send invite', err);
      alert(err.message || 'Failed to send invitation');
    }
  };

  // Drop a collaborator from the workspace. The server also strips them from the
  // board's cards and tasks, so reload rather than patching state by hand.
  const handleRemoveMember = async (member) => {
    const confirmed = window.confirm(
      `Remove ${member.name} from this workspace?\n\nThey lose access immediately and are unassigned from every card and task here.`
    );
    if (!confirmed) return;

    try {
      const res = await fetchWithAuth(`/boards/${boardId}/members/${member.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        throw new Error(detail || data.error || 'Failed to remove member');
      }
      await loadBoardData();
    } catch (err) {
      console.error('Failed to remove member', err);
      alert(err.message || 'Failed to remove member');
    }
  };

  // Board CRUD updates
  const handleUpdateBoard = async (e) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/boards/${boardId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editBoardName, description: editBoardDesc })
      });
      setShowEditBoard(false);
      loadBoardData();
    } catch (err) {
      console.error('Failed to update board', err);
      alert(err.message || 'Failed to update board');
    }
  };

  const handleDeleteBoard = async () => {
    if (!window.confirm('CRITICAL: Are you sure you want to permanently delete this board? This action cannot be undone.')) return;
    try {
      await fetchWithAuth(`/boards/${boardId}`, {
        method: 'DELETE'
      });
      navigate('/');
    } catch (err) {
      console.error('Failed to delete board', err);
      alert(err.message || 'Failed to delete board');
    }
  };

  return (
    <div className="app-layout">
      {/* Header bar */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link to="/" className="logo">
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </Link>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '18px', fontWeight: '800' }}>{board?.name}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{board?.description || 'No description'}</span>
          </div>
        </div>

        <div className="header-actions">
          {/* Member avatars - click to reveal the full member list */}
          <div ref={membersRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMembers(open => !open)}
              className="secondary"
              title="Board members"
              aria-haspopup="true"
              aria-expanded={showMembers}
              style={{ padding: '4px 12px 4px 10px', gap: '8px', borderRadius: '30px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {boardMembers.slice(0, 4).map(member => (
                  <img
                    key={member.id}
                    src={member.avatarUrl}
                    alt={member.name}
                    style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--bg-primary)', marginLeft: '-6px', background: '#374151' }}
                  />
                ))}
                {boardMembers.length > 4 && (
                  <span style={{ fontSize: '11px', fontWeight: 'bold', background: 'var(--bg-tertiary)', padding: '5px', borderRadius: '50%', border: '2px solid var(--bg-primary)', color: 'var(--text-secondary)', marginLeft: '-6px' }}>
                    +{boardMembers.length - 4}
                  </span>
                )}
              </div>
              <Users style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: '12px', fontWeight: 700 }}>{boardMembers.length}</span>
            </button>

            {showMembers && (
              <div
                className="glass-panel"
                style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: '290px', padding: '8px', zIndex: 150, maxHeight: '360px', overflowY: 'auto' }}
              >
                <div style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Members · {boardMembers.length}
                </div>

                {boardMembers.length === 0 ? (
                  <div style={{ padding: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    No members yet
                  </div>
                ) : (
                  boardMembers.map(member => {
                    const memberRole = roleOf(member.id);
                    // Reuse the existing task-badge palette: owner green, leader
                    // purple, member blue, viewer grey
                    const roleBadgeClass = {
                      owner: 'done',
                      leader: 'review',
                      member: 'backlog',
                      viewer: 'icebox'
                    }[memberRole] || 'backlog';
                    return (
                      <div
                        key={member.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: 'var(--border-radius-sm)' }}
                      >
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-tertiary)', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {member.name}{member.id === user?.id && ' (You)'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {member.email}
                          </div>
                        </div>
                        <span className={`task-badge ${roleBadgeClass}`} style={{ flexShrink: 0 }}>
                          {memberRole}
                        </span>
                        {canRemoveMember(member.id) && (
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="secondary"
                            title={`Remove ${member.name} from this workspace`}
                            aria-label={`Remove ${member.name} from this workspace`}
                            style={{ flexShrink: 0, padding: '5px', color: 'var(--danger, #ef4444)' }}
                          >
                            <UserMinus style={{ width: 14, height: 14 }} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {canEditContent && (
                  <button
                    onClick={() => { setShowMembers(false); setShowInviteModal(true); }}
                    className="secondary"
                    style={{ width: '100%', marginTop: '6px', padding: '8px', fontSize: '12px', borderStyle: 'dashed' }}
                  >
                    <UserPlus style={{ width: 14, height: 14 }} />
                    Invite people
                  </button>
                )}
              </div>
            )}
          </div>

          {canEditContent && (
            <button onClick={() => setShowInviteModal(true)} className="secondary" style={{ padding: '8px 12px', fontSize: '12px' }}>
              <UserPlus style={{ width: 14, height: 14 }} />
              Invite
            </button>
          )}

          {/* Members may upload the attachments; the board's managers and the
              administrators turn them into a slide deck */}
          {canBuildDeck && (
            <button onClick={() => setShowDeckModal(true)} className="secondary" style={{ padding: '8px 12px', fontSize: '12px' }} title="Tạo slide .pptx từ tệp đính kèm của bảng">
              <Presentation style={{ width: 14, height: 14 }} />
              Slides
            </button>
          )}

          {canManageBoard && (
            <button onClick={() => setShowEditBoard(true)} className="secondary" style={{ padding: '8px 12px' }} title="Workspace settings">
              <Settings style={{ width: 15, height: 15 }} />
            </button>
          )}
        </div>
      </header>

      {/* Cards Tabs selection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', background: 'rgba(11, 15, 25, 0.4)' }}>
        {cards.map(card => (
          <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setSelectedCardId(card.id)}
              className={selectedCardId === card.id ? 'primary' : 'secondary'}
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '20px' }}
            >
              {card.name}
            </button>
            {selectedCardId === card.id && canEditContent && (
              <button
                onClick={() => handleDeleteCard(card.id)}
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#fca5a5', padding: '4px', borderRadius: '50%', cursor: 'pointer' }}
                title="Delete List"
              >
                <Trash style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>
        ))}
        {!canEditContent ? null : !showAddCard ? (
          <button 
            onClick={() => setShowAddCard(true)} 
            className="secondary" 
            style={{ padding: '6px 12px', fontSize: '12px', borderStyle: 'dashed', borderRadius: '20px' }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add List
          </button>
        ) : (
          <form onSubmit={handleCreateCard} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              required
              placeholder="List name..."
              value={newCardName}
              onChange={(e) => setNewCardName(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', width: '150px' }}
            />
            <button type="submit" className="primary" style={{ padding: '6px 10px', fontSize: '12px' }}>Add</button>
            <button type="button" onClick={() => setShowAddCard(false)} className="secondary" style={{ padding: '6px 10px', fontSize: '12px' }}>Cancel</button>
          </form>
        )}
      </div>

      {/* Board Columns container */}
      <div className="board-container" style={{ padding: '24px', flex: 1, overflowY: 'hidden' }}>
        {selectedCardId ? (
          <div className="board-columns" style={{ display: 'flex', gap: '20px', overflowX: 'auto', height: '100%', alignItems: 'flex-start', paddingBottom: '12px' }}>
            {['Icebox', 'Backlog', 'On Going', 'Waiting for Review', 'Done'].map(statusName => {
              const cardTasks = (tasks[selectedCardId] || []).filter(t => {
                const tStatus = (t.status || 'Icebox').toLowerCase().replace(/\s/g, '');
                const sName = statusName.toLowerCase().replace(/\s/g, '');
                return tStatus === sName;
              });

              return (
                <div 
                  key={statusName} 
                  className={`column ${dragOverCardId === selectedCardId && dragOverStatus === statusName ? 'drag-over' : ''}`}
                  style={{ width: '300px', flexShrink: 0, maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(17, 24, 39, 0.55)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', padding: '16px' }}
                  onDragOver={(e) => handleDragOverColumn(e, selectedCardId, statusName)}
                  onDrop={(e) => handleDrop(e, selectedCardId, statusName)}
                >
                  {/* Column header */}
                  <div className="column-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <span className="column-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {statusName}
                      <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '10px', color: 'var(--text-secondary)' }}>
                        {cardTasks.length}
                      </span>
                    </span>
                  </div>

                  {/* Tasks List */}
                  <div className="task-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, minHeight: '100px', padding: '4px' }}>
                    {cardTasks.map(task => (
                      <div
                        key={task.id}
                        id={`task-${task.id}`}
                        className={`task-card ${draggedTaskId === task.id ? 'dragging' : ''}`}
                        style={canEditContent ? undefined : { cursor: 'pointer' }}
                        draggable={canEditContent}
                        onDragStart={(e) => handleDragStart(e, task.id, selectedCardId)}
                        onDragEnd={(e) => handleDragEnd(e, task.id)}
                        onClick={() => {
                          setActiveTask(task);
                          setActiveCardId(selectedCardId);
                        }}
                      >
                        <div className="task-card-title">{task.title}</div>
                        <div className="task-card-desc">{task.description || 'No description'}</div>
                        {task.dueDate && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '11px', fontWeight: 700, color: isOverdue(task) ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
                            <Calendar style={{ width: 11, height: 11 }} />
                            {new Date(task.dueDate).toLocaleDateString()}
                            {isOverdue(task) && ' · overdue'}
                          </div>
                        )}
                        <div className="task-card-footer">
                          <span className={`task-badge ${statusName.toLowerCase().replace(/\s/g, '')}`}>{statusName}</span>
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {task.assignedMembers?.map(mId => {
                              const assignee = allUsers.find(u => u.id === mId);
                              return assignee ? (
                                <img
                                  key={mId}
                                  src={assignee.avatarUrl}
                                  alt={assignee.name}
                                  title={assignee.name}
                                  style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-tertiary)' }}
                                />
                              ) : null;
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inline task creator - viewers have read-only access */}
                  {canEditContent && (
                    <TaskCreator onSubmit={(title) => handleAddTask(selectedCardId, title)} />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 40px', borderStyle: 'dashed' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>No task lists created</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '20px' }}>
              Create a list (tab) first to start adding columns and tasks.
            </p>
          </div>
        )}
      </div>

      {/* Invite Modal overlay */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px' }}>Invite Collaborator</h2>
            <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label>Select Registered Member</label>
                <select value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)}>
                  <option value="">-- Choose registered user --</option>
                  {allUsers
                    .filter(u => u.id !== user.id && !board.members?.includes(u.id))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                </select>
              </div>

              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>OR</div>

              <div>
                <label>Invite by Email Address</label>
                <input
                  type="email"
                  placeholder="collaborator@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>

              {/* Role picker - decides what the invitee may do once they accept */}
              <div>
                <label>Role on this board</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {ROLE_OPTIONS.map(option => {
                    const selected = inviteRole === option.value;
                    // Only the owner and leaders are allowed to grant the leader role
                    const disabled = option.value === 'leader' && !canManageBoard;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setInviteRole(option.value)}
                        aria-pressed={selected}
                        title={disabled ? 'Only the owner or a leader can grant this role' : option.hint}
                        className={selected ? 'primary' : 'secondary'}
                        style={{ flex: 1, flexDirection: 'column', gap: '2px', padding: '10px 8px', alignItems: 'flex-start' }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>{option.label}</span>
                        <span style={{ fontSize: '10px', fontWeight: 500, opacity: 0.75, textAlign: 'left', lineHeight: 1.3 }}>
                          {option.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowInviteModal(false)} className="secondary">
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Workspace settings Modal overlay */}
      {showEditBoard && (
        <div className="modal-overlay" onClick={() => setShowEditBoard(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '24px' }}>Workspace Settings</h2>
            <form onSubmit={handleUpdateBoard} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="edit-name">Board Name</label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  value={editBoardName}
                  onChange={(e) => setEditBoardName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="edit-desc">Description</label>
                <textarea
                  id="edit-desc"
                  rows="3"
                  value={editBoardDesc}
                  onChange={(e) => setEditBoardDesc(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Leaders can edit settings, but only the owner may delete the board */}
                {isOwner ? (
                  <button type="button" onClick={handleDeleteBoard} className="danger">
                    <Trash style={{ width: 16, height: 16 }} />
                    Delete Board
                  </button>
                ) : <span />}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setShowEditBoard(false)} className="secondary">
                    Cancel
                  </button>
                  <button type="submit" className="primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide deck builder: the board's attachments in, a .pptx out */}
      {showDeckModal && (
        <DeckModal
          boardId={boardId}
          boardName={board?.name || ''}
          onClose={() => setShowDeckModal(false)}
        />
      )}

      {/* Selected Task Details Modal */}
      {activeTask && (
        <TaskModal
          boardId={boardId}
          cardId={activeCardId}
          taskId={activeTask.id}
          members={boardMembers}
          canEditContent={canEditContent}
          canDeleteTask={canManageBoard}
          canSetDeadline={canManageBoard}
          onClose={() => {
            setActiveTask(null);
            setActiveCardId('');
            loadBoardData();
          }}
        />
      )}
    </div>
  );
}

// Sub-component for adding tasks inline in a card column
function TaskCreator({ onSubmit }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit(title);
    setTitle('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="secondary" style={{ width: '100%', marginTop: '8px', borderStyle: 'none', background: 'rgba(255,255,255,0.03)', padding: '8px', fontSize: '12px' }}>
        <PlusCircle style={{ width: 14, height: 14 }} />
        Add Task Card
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        ref={inputRef}
        type="text"
        required
        placeholder="Task title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setOpen(false)} className="secondary" style={{ padding: '4px 8px', fontSize: '11px' }}>
          Cancel
        </button>
        <button type="submit" className="primary" style={{ padding: '4px 8px', fontSize: '11px' }}>
          Add Task
        </button>
      </div>
    </form>
  );
}
