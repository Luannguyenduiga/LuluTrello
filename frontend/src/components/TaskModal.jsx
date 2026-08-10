import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, User, Trash, Link2, Plus, Calendar, CheckSquare, FileText, ChevronRight, Hash } from 'lucide-react';

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

export default function TaskModal({ boardId, cardId, taskId, members, onClose }) {
  const { fetchWithAuth } = useAuth();

  const [task, setTask] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Icebox');

  // Assignees
  const [assigned, setAssigned] = useState([]); // [{ taskId, memberId }]
  const [selectedMember, setSelectedMember] = useState('');

  // GitHub Attachment state
  const [attachments, setAttachments] = useState([]);
  const [repoId, setRepoId] = useState('facebook/react'); // Default mockup
  const [repoDetails, setRepoDetails] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedPull, setSelectedPull] = useState('');
  const [selectedIssue, setSelectedIssue] = useState('');
  const [selectedCommit, setSelectedCommit] = useState('');
  const [repoLoading, setRepoLoading] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);

  useEffect(() => {
    loadTaskDetails();
  }, [taskId]);

  const loadTaskDetails = async () => {
    try {
      const res = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}`);
      const data = await res.json();
      setTask(data);
      setTitle(data.title);
      setDescription(data.description || '');
      setStatus(data.status || 'Icebox');

      // Fetch Assigned members
      const assignRes = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/assign`);
      const assignData = await assignRes.json();
      setAssigned(assignData);

      // Fetch GitHub attachments
      const attachRes = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/github-attachments`);
      const attachData = await attachRes.json();
      setAttachments(attachData);
    } catch (err) {
      console.error('Failed to load task details', err);
    }
  };

  const handleUpdateDetails = async (e) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          description,
          status,
          card_id: cardId
        })
      });
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to update task details', err);
    }
  };

  // Member Assignment
  const handleAssignMember = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ memberId: selectedMember })
      });
      setSelectedMember('');
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to assign member', err);
    }
  };

  const handleRemoveAssignee = async (memberId) => {
    try {
      await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/assign/${memberId}`, {
        method: 'DELETE'
      });
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to remove assignee', err);
    }
  };

  // GitHub Actions
  const handleLoadRepo = async (e) => {
    e.preventDefault();
    if (!repoId.trim()) return;

    setRepoLoading(true);
    setRepoDetails(null);
    try {
      const encodedRepo = encodeURIComponent(repoId.trim());
      const res = await fetchWithAuth(`/repositories/${encodedRepo}/github-info`);
      if (!res.ok) throw new Error('Repository not found or access denied');
      const data = await res.json();
      setRepoDetails(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setRepoLoading(false);
    }
  };

  const handleAttachItem = async (type, identifier) => {
    if (!identifier) return;
    setAttachmentLoading(true);
    try {
      // Body payload: type, number/sha
      const body = { type };
      if (type === 'commit') {
        body.sha = identifier;
      } else {
        body.number = identifier; // pull request number or issue number
      }

      await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/github-attach`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      
      // Reset selection
      if (type === 'branch') setSelectedBranch('');
      if (type === 'pull_request') setSelectedPull('');
      if (type === 'issue') setSelectedIssue('');
      if (type === 'commit') setSelectedCommit('');

      loadTaskDetails();
    } catch (err) {
      console.error('Failed to attach item', err);
    } finally {
      setAttachmentLoading(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    try {
      await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/github-attachments/${attachmentId}`, {
        method: 'DELETE'
      });
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to remove attachment', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckSquare style={{ width: 12, height: 12 }} />
              Task Workspace Details
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '4px' }}>{task?.title}</h2>
          </div>
          <button onClick={onClose} className="secondary" style={{ padding: '6px', borderRadius: '50%' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Content columns split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
          
          {/* Column Left: Main forms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Task Details edit form */}
            <form onSubmit={handleUpdateDetails} className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.015)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                General Settings
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label htmlFor="task-title">Title</label>
                  <input
                    id="task-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="task-desc">Description</label>
                  <textarea
                    id="task-desc"
                    rows="3"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="task-status">Task Status</label>
                  <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="Icebox">Icebox</option>
                    <option value="Backlog">Backlog</option>
                    <option value="On Going">On Going</option>
                    <option value="Waiting for Review">Waiting for Review</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <button type="submit" className="primary" style={{ alignSelf: 'flex-end', padding: '8px 16px', fontSize: '12px' }}>
                  Save General details
                </button>
              </div>
            </form>

            {/* Task Assignees management */}
            <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.015)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Assigned Team Members ({assigned.length})
              </h3>
              
              {/* Member Assign form */}
              <form onSubmit={handleAssignMember} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <select 
                  value={selectedMember} 
                  onChange={(e) => setSelectedMember(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Choose team member</option>
                  {members
                    .filter(m => !assigned.some(a => a.memberId === m.id))
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                    ))}
                </select>
                <button type="submit" className="primary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                  <Plus style={{ width: 14, height: 14 }} />
                  Assign
                </button>
              </form>

              {/* Assigned list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {assigned.map(assigneeObj => {
                  const memberInfo = members.find(m => m.id === assigneeObj.memberId);
                  return memberInfo ? (
                    <div key={assigneeObj.memberId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img src={memberInfo.avatarUrl} alt="Avatar" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{memberInfo.name}</span>
                      </div>
                      <button onClick={() => handleRemoveAssignee(assigneeObj.memberId)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }} onMouseEnter={(e) => e.target.style.color = 'var(--accent-danger)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>
                        <Trash style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </div>

          {/* Column Right: GitHub Integrations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Repo linker */}
            <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.015)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Github style={{ width: 16, height: 16 }} />
                GitHub Link Integrator
              </h3>

              <form onSubmit={handleLoadRepo} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <input
                  type="text"
                  required
                  placeholder="e.g. owner/repository"
                  value={repoId}
                  onChange={(e) => setRepoId(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={repoLoading} className="secondary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                  {repoLoading ? 'Loading...' : 'Connect'}
                </button>
              </form>

              {/* Repo Resource selectors */}
              {repoDetails && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Link2 style={{ width: 12, height: 12 }} />
                    Connected to {repoDetails.repositoryId}
                  </span>

                  {/* Branches */}
                  {repoDetails.branches?.length > 0 && (
                    <div>
                      <label style={{ fontSize: '11px' }}>Attach Git Branch</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}>
                          <option value="">-- Choose Branch --</option>
                          {repoDetails.branches.map(b => (
                            <option key={b.name} value={b.name}>{b.name}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => handleAttachItem('branch', selectedBranch)} className="primary" style={{ padding: '6px 10px' }}><Plus style={{ width: 14, height: 14 }} /></button>
                      </div>
                    </div>
                  )}

                  {/* Pull Requests */}
                  {repoDetails.pulls?.length > 0 && (
                    <div>
                      <label style={{ fontSize: '11px' }}>Attach Pull Request</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select value={selectedPull} onChange={(e) => setSelectedPull(e.target.value)} style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}>
                          <option value="">-- Choose PR --</option>
                          {repoDetails.pulls.map(p => (
                            <option key={p.pullNumber} value={p.pullNumber}>#{p.pullNumber} — {p.title}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => handleAttachItem('pull_request', selectedPull)} className="primary" style={{ padding: '6px 10px' }}><Plus style={{ width: 14, height: 14 }} /></button>
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {repoDetails.issues?.length > 0 && (
                    <div>
                      <label style={{ fontSize: '11px' }}>Attach Issue</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select value={selectedIssue} onChange={(e) => setSelectedIssue(e.target.value)} style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}>
                          <option value="">-- Choose Issue --</option>
                          {repoDetails.issues.map(i => (
                            <option key={i.issueNumber} value={i.issueNumber}>#{i.issueNumber} — {i.title}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => handleAttachItem('issue', selectedIssue)} className="primary" style={{ padding: '6px 10px' }}><Plus style={{ width: 14, height: 14 }} /></button>
                      </div>
                    </div>
                  )}

                  {/* Commits */}
                  {repoDetails.commits?.length > 0 && (
                    <div>
                      <label style={{ fontSize: '11px' }}>Attach Commit</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select value={selectedCommit} onChange={(e) => setSelectedCommit(e.target.value)} style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}>
                          <option value="">-- Choose Commit --</option>
                          {repoDetails.commits.map(c => (
                            <option key={c.sha} value={c.sha}>[{c.sha}] {c.message}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => handleAttachItem('commit', selectedCommit)} className="primary" style={{ padding: '6px 10px' }}><Plus style={{ width: 14, height: 14 }} /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Connected attachments list */}
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: '800', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                  Linked Resources ({attachments.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attachments.map(att => (
                    <div key={att.attachmentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <Hash style={{ width: 13, height: 13, color: 'var(--accent-primary)' }} />
                        <span style={{ textTransform: 'capitalize', fontWeight: '700' }}>{att.type.replace('_', ' ')}:</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{att.number || att.sha || 'linked item'}</span>
                      </div>
                      <button onClick={() => handleRemoveAttachment(att.attachmentId)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }} onMouseEnter={(e) => e.target.style.color = 'var(--accent-danger)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>
                        <Trash style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
