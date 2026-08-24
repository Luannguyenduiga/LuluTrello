import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Users, LayoutGrid, ListChecks, AlertTriangle, RefreshCw, Trash2,
  Bot, Send, FileText, Play, Search, ShieldAlert, MessageSquare, CheckCircle2,
} from 'lucide-react';

const STATUSES = ['Icebox', 'Backlog', 'On Going', 'Waiting for Review', 'Done'];

/** One headline number. */
function Stat({ icon: Icon, label, value, hint, tone = 'default' }) {
  const color = {
    default: 'var(--accent-primary)',
    danger: 'var(--accent-danger)',
    success: 'var(--accent-success)',
    warning: 'var(--accent-warning)',
  }[tone];

  return (
    <div className="glass-panel" style={{ padding: '18px 20px', flex: '1 1 170px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
        <Icon style={{ width: 15, height: 15, color }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, letterSpacing: '-0.5px', color }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="glass-panel" style={{ padding: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Tables scroll inside their own box so the page never scrolls sideways. */
function Table({ columns, rows, empty }) {
  if (!rows.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{empty}</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase' }}>
            {columns.map((column) => (
              <th key={column} style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

const cell = { padding: '10px', borderTop: '1px solid var(--border-color)', verticalAlign: 'middle' };

function Bar({ percent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 70, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-success)' }} />
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{percent}%</span>
    </div>
  );
}

export default function Admin() {
  const { user, fetchWithAuth } = useAuth();

  const [tab, setTab] = useState('system');
  const [allowed, setAllowed] = useState(null); // null = still checking
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // System tab
  const [overview, setOverview] = useState(null);
  const [people, setPeople] = useState([]);
  const [boards, setBoards] = useState([]);
  const [tasks, setTasks] = useState({ total: 0, rows: [] });
  const [filters, setFilters] = useState({ boardId: '', status: '', overdue: false, search: '' });

  // Zalo tab
  const [zalo, setZalo] = useState(null);
  const [zaloError, setZaloError] = useState('');
  const [output, setOutput] = useState('');
  const [question, setQuestion] = useState('');

  const json = useCallback(
    async (url, options) => {
      const res = await fetchWithAuth(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        throw new Error(detail || 'Yêu cầu thất bại');
      }
      return data;
    },
    [fetchWithAuth],
  );

  const loadSystem = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (filters.boardId) query.set('boardId', filters.boardId);
      if (filters.status) query.set('status', filters.status);
      if (filters.overdue) query.set('overdue', 'true');
      if (filters.search.trim()) query.set('search', filters.search.trim());

      const [o, u, b, t] = await Promise.all([
        json('/admin/overview'),
        json('/admin/users'),
        json('/admin/boards'),
        json(`/admin/tasks?${query.toString()}`),
      ]);
      setOverview(o);
      setPeople(u);
      setBoards(b);
      setTasks(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [json, filters]);

  const loadZalo = useCallback(async () => {
    setZaloError('');
    try {
      setZalo(await json('/zalo/status'));
    } catch (err) {
      setZaloError(err.message);
    }
  }, [json]);

  // Whether this account may see the console at all
  useEffect(() => {
    json('/admin/me')
      .then((data) => setAllowed(data.isAdmin))
      .catch(() => setAllowed(false));
  }, [json]);

  useEffect(() => {
    if (allowed) loadSystem();
  }, [allowed, loadSystem]);

  useEffect(() => {
    if (allowed && tab === 'zalo' && !zalo) loadZalo();
  }, [allowed, tab, zalo, loadZalo]);

  const removeTask = async (id, title) => {
    if (!window.confirm(`Xoá công việc "${title}"? Không thể hoàn tác.`)) return;
    try {
      await json(`/admin/tasks/${id}`, { method: 'DELETE' });
      loadSystem();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeBoard = async (id, name, count) => {
    if (!window.confirm(`Xoá bảng "${name}" cùng ${count} công việc bên trong? Không thể hoàn tác.`)) return;
    try {
      await json(`/admin/boards/${id}`, { method: 'DELETE' });
      loadSystem();
    } catch (err) {
      setError(err.message);
    }
  };

  const runZalo = async (label, url, options) => {
    setBusy(true);
    setOutput(`⏳ ${label}…`);
    try {
      const data = await json(url, options);
      setOutput(data.text || data.answer || JSON.stringify(data, null, 2));
    } catch (err) {
      setOutput(`❌ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Đang kiểm tra quyền quản trị…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="app-layout">
        <main className="dashboard-content" style={{ paddingTop: 60 }}>
          <div className="glass-panel" style={{ padding: 32, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
            <ShieldAlert style={{ width: 40, height: 40, color: 'var(--accent-warning)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>Không có quyền truy cập</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
              Tài khoản <strong>{user?.email}</strong> không nằm trong danh sách quản trị.
              Thêm email này vào <code>ADMIN_EMAILS</code> trong .env của server rồi đăng nhập lại.
            </p>
            <Link to="/dashboard" className="primary" style={{ display: 'inline-flex', marginTop: 20 }}>
              Về Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const tabStyle = (key) => ({
    padding: '8px 16px',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid ' + (tab === key ? 'var(--accent-primary)' : 'var(--border-color)'),
    background: tab === key ? 'var(--accent-primary)' : 'transparent',
    color: tab === key ? 'var(--accent-white)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  });

  return (
    <div className="app-layout">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/dashboard" className="logo">
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </Link>
          <span style={{ fontWeight: 700 }}>Bảng quản trị</span>
        </div>
        <div className="header-actions">
          <button onClick={tab === 'zalo' ? loadZalo : loadSystem} className="secondary" disabled={busy} style={{ padding: '8px 12px' }}>
            <RefreshCw style={{ width: 15, height: 15 }} />
            <span>Tải lại</span>
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button style={tabStyle('system')} onClick={() => setTab('system')}>Hệ thống</button>
          <button style={tabStyle('zalo')} onClick={() => setTab('zalo')}>Trợ lý Zalo</button>
        </div>

        {error && (
          <div className="glass-panel" style={{ padding: 14, borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)', fontSize: 14 }}>
            {error}
          </div>
        )}

        {tab === 'system' && (
          <>
            {overview && (
              <>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <Stat icon={Users} label="Người dùng" value={overview.counts.users} />
                  <Stat icon={LayoutGrid} label="Bảng" value={overview.counts.boards} hint={`${overview.counts.cards} danh sách`} />
                  <Stat icon={ListChecks} label="Công việc" value={overview.counts.tasks} hint={`${overview.progress.done} hoàn thành (${overview.progress.percent}%)`} tone="success" />
                  <Stat icon={AlertTriangle} label="Quá hạn" value={overview.progress.overdue} hint={`${overview.progress.unassigned} chưa giao ai`} tone={overview.progress.overdue ? 'danger' : 'default'} />
                  <Stat icon={CheckCircle2} label="Hôm nay" value={`+${overview.today.created} / ${overview.today.completed}`} hint={overview.timezone} tone="warning" />
                </div>

                <Panel title="Công việc theo trạng thái">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {Object.entries(overview.byStatus).map(([status, count]) => (
                      <span key={status} className="task-badge" style={{ padding: '6px 12px', fontSize: 13 }}>
                        {status}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                </Panel>
              </>
            )}

            <Panel title={`Bảng (${boards.length})`}>
              <Table
                columns={['Tên bảng', 'Chủ sở hữu', 'Thành viên', 'Công việc', 'Tiến độ', 'Quá hạn', '']}
                empty="Chưa có bảng nào."
                rows={boards.map((board) => (
                  <tr key={board.id}>
                    <td style={cell}>
                      <Link to={`/boards/${board.id}`} style={{ fontWeight: 600 }}>{board.name}</Link>
                      {board.description && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{board.description}</div>
                      )}
                    </td>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>{board.owner}</td>
                    <td style={cell}>{board.members}</td>
                    <td style={cell}>{board.tasks}</td>
                    <td style={cell}><Bar percent={board.percent} /></td>
                    <td style={{ ...cell, color: board.overdue ? 'var(--accent-danger)' : 'var(--text-muted)' }}>{board.overdue}</td>
                    <td style={cell}>
                      <button onClick={() => removeBoard(board.id, board.name, board.tasks)} className="secondary" title="Xoá bảng và toàn bộ nội dung" style={{ padding: '6px 10px' }}>
                        <Trash2 style={{ width: 14, height: 14, color: 'var(--accent-danger)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              />
            </Panel>

            <Panel title={`Người dùng (${people.length})`}>
              <Table
                columns={['Tên', 'Email', 'Đăng nhập', 'Bảng', 'Việc đang mở', 'Quá hạn']}
                empty="Chưa có người dùng nào."
                rows={people.map((person) => (
                  <tr key={person.id}>
                    <td style={cell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {person.avatarUrl && <img src={person.avatarUrl} alt="" className="user-avatar" style={{ width: 26, height: 26 }} />}
                        <span style={{ fontWeight: 600 }}>{person.name}</span>
                      </div>
                    </td>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>{person.email}</td>
                    <td style={{ ...cell, color: 'var(--text-muted)' }}>{person.provider}</td>
                    <td style={cell}>{person.boards}</td>
                    <td style={cell}>{person.openTasks}</td>
                    <td style={{ ...cell, color: person.overdue ? 'var(--accent-danger)' : 'var(--text-muted)' }}>{person.overdue}</td>
                  </tr>
                ))}
              />
            </Panel>

            <Panel
              title={`Công việc (${tasks.rows.length}/${tasks.total})`}
              action={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <Search style={{ width: 14, height: 14, position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
                    <input
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && loadSystem()}
                      placeholder="Tìm theo tên…"
                      style={{ paddingLeft: 30, fontSize: 13 }}
                    />
                  </div>
                  <select value={filters.boardId} onChange={(e) => setFilters({ ...filters, boardId: e.target.value })} style={{ fontSize: 13 }}>
                    <option value="">Mọi bảng</option>
                    {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                  </select>
                  <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ fontSize: 13 }}>
                    <option value="">Mọi trạng thái</option>
                    {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })} />
                    Chỉ quá hạn
                  </label>
                  <button onClick={loadSystem} className="secondary" disabled={busy} style={{ padding: '8px 12px', fontSize: 13 }}>Lọc</button>
                </div>
              }
            >
              <Table
                columns={['Công việc', 'Bảng', 'Trạng thái', 'Hạn', 'Phụ trách', '']}
                empty="Không có công việc nào khớp bộ lọc."
                rows={tasks.rows.map((task) => (
                  <tr key={task.id}>
                    <td style={cell}>
                      <span style={{ fontWeight: 600 }}>{task.title}</span>
                      {(task.comments > 0 || task.attachments > 0) && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
                          💬{task.comments} 📎{task.attachments}
                        </span>
                      )}
                    </td>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>{task.board}</td>
                    <td style={cell}><span className="task-badge">{task.status}</span></td>
                    <td style={{ ...cell, color: task.overdue ? 'var(--accent-danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN') : '—'}
                      {task.overdue && ' ⚠️'}
                    </td>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>
                      {task.assignees.length ? task.assignees.join(', ') : 'chưa giao'}
                    </td>
                    <td style={cell}>
                      <button onClick={() => removeTask(task.id, task.title)} className="secondary" title="Xoá công việc" style={{ padding: '6px 10px' }}>
                        <Trash2 style={{ width: 14, height: 14, color: 'var(--accent-danger)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              />
              {tasks.total > tasks.rows.length && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>
                  Hiển thị {tasks.rows.length} trong {tasks.total} kết quả — dùng bộ lọc để thu hẹp.
                </p>
              )}
            </Panel>
          </>
        )}

        {tab === 'zalo' && (
          <>
            {zaloError && (
              <div className="glass-panel" style={{ padding: 14, borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)', fontSize: 14 }}>
                {zaloError}
              </div>
            )}

            {zalo && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Stat
                  icon={Bot}
                  label="Trạng thái bot"
                  value={zalo.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                  hint={zalo.bot?.display_name || zalo.tokenError || 'chưa có token'}
                  tone={zalo.ready ? 'success' : 'danger'}
                />
                <Stat icon={MessageSquare} label="Nhóm nhận tin" value={zalo.chatId ? 'Đã cấu hình' : 'Chưa có'} hint={zalo.chatId || 'đặt ZALO_CHAT_ID'} tone={zalo.chatId ? 'default' : 'warning'} />
                <Stat
                  icon={FileText}
                  label="Báo cáo kế tiếp"
                  value={zalo.report.time}
                  hint={new Date(zalo.report.nextRunAt).toLocaleString('vi-VN')}
                />
              </div>
            )}

            <Panel title="Thao tác">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="secondary" disabled={busy} onClick={() => runZalo('Đang gửi tin thử', '/zalo/test', { method: 'POST', body: JSON.stringify({}) })}>
                  <Send style={{ width: 15, height: 15 }} /> Gửi tin thử vào nhóm
                </button>
                <button className="secondary" disabled={busy} onClick={() => runZalo('Đang dựng báo cáo', '/zalo/report/preview')}>
                  <FileText style={{ width: 15, height: 15 }} /> Xem trước báo cáo
                </button>
                <button className="secondary" disabled={busy} onClick={() => runZalo('Đang gửi báo cáo', '/zalo/report/run', { method: 'POST' })}>
                  <Play style={{ width: 15, height: 15 }} /> Gửi báo cáo ngay
                </button>
                <button className="secondary" disabled={busy} onClick={() => runZalo('Đang dò tin nhắn (tối đa 25s)', '/zalo/updates')}>
                  <Search style={{ width: 15, height: 15 }} /> Dò chat id
                </button>
              </div>
            </Panel>

            <Panel title="Hỏi thử trợ lý">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && question.trim() && runZalo('Đang hỏi', '/zalo/ask', { method: 'POST', body: JSON.stringify({ question }) })}
                  placeholder='Ví dụ: "có gì quá hạn không"'
                  style={{ flex: '1 1 320px', fontSize: 14 }}
                />
                <button
                  className="primary"
                  disabled={busy || !question.trim()}
                  onClick={() => runZalo('Đang hỏi', '/zalo/ask', { method: 'POST', body: JSON.stringify({ question }) })}
                >
                  Hỏi
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                Câu trả lời chỉ hiện ở đây, không gửi vào nhóm.
              </p>
            </Panel>

            {output && (
              <Panel title="Kết quả" action={<button className="secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setOutput('')}>Xoá</button>}>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  {output}
                </pre>
              </Panel>
            )}
          </>
        )}
      </main>
    </div>
  );
}
