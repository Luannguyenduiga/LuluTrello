import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import FilePreviewModal from "./FilePreviewModal";
import {
  X,
  User,
  Trash,
  Plus,
  Calendar,
  CalendarPlus,
  CheckSquare,
  AlertCircle,
} from "lucide-react";

/**
 * <input type="datetime-local"> speaks local wall-clock time with no zone, while
 * the API stores a UTC instant so members in different zones agree on the moment.
 * Slicing the ISO string instead of converting would silently shift the hour.
 */
const isoToLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Google's template URL wants basic-format UTC: 20260811T090000Z */
const toGoogleStamp = (date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const deadlineLockedReason =
  "Only the board owner or a leader can set a deadline";

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

// Editing a task is the widest permission; deleting it and scheduling it are both
// narrower. They are separate props so each control can be shown greyed out to a
// member rather than vanishing, and each mirrors a rule the API enforces too.
export default function TaskModal({
  boardId,
  cardId,
  taskId,
  members,
  canEditContent = true,
  canDeleteTask = true,
  canSetDeadline = true,
  onClose,
}) {
  const { user, fetchWithAuth, API_URL } = useAuth();

  const [task, setTask] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Icebox");
  const [dueDate, setDueDate] = useState(""); // local wall-clock, for the picker

  // Assignees
  const [assigned, setAssigned] = useState([]); // [{ taskId, memberId }]
  const [selectedMember, setSelectedMember] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  const [commentText, setCommentText] = useState("");
  // The attachment currently open in the viewer, or null.
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    loadTaskDetails();
  }, [taskId]);

  const loadTaskDetails = async () => {
    try {
      const res = await fetchWithAuth(
        `/boards/${boardId}/cards/${cardId}/tasks/${taskId}`,
      );
      const data = await res.json();
      setTask(data);
      setTitle(data.title);
      setDescription(data.description || "");
      setStatus(data.status || "Icebox");
      setDueDate(isoToLocalInput(data.dueDate));

      // Fetch Assigned members
      const assignRes = await fetchWithAuth(
        `/boards/${boardId}/cards/${cardId}/tasks/${taskId}/assign`,
      );
      const assignData = await assignRes.json();
      setAssigned(assignData);
    } catch (err) {
      console.error("Failed to load task details", err);
    }
  };

  const handleUpdateDetails = async (e) => {
    e.preventDefault();
    try {
      const payload = { title, description, status, card_id: cardId };
      // The API rejects the field outright from anyone who may not schedule, so
      // it is only sent by someone allowed to change it -- otherwise every save
      // a member makes would come back 403 over a value they never touched.
      if (canSetDeadline) {
        // '' clears the deadline; otherwise hand the API a UTC instant
        payload.dueDate = dueDate ? new Date(dueDate).toISOString() : "";
      }

      await fetchWithAuth(
        `/boards/${boardId}/cards/${cardId}/tasks/${taskId}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      loadTaskDetails();
    } catch (err) {
      console.error("Failed to update task details", err);
      alert(err.message || "Failed to update task details");
    }
  };

  const handleDeleteTask = async () => {
    if (
      !window.confirm(
        "Delete this task permanently? This action cannot be undone.",
      )
    )
      return;
    try {
      await fetchWithAuth(
        `/boards/${boardId}/cards/${cardId}/tasks/${taskId}`,
        {
          method: "DELETE",
        },
      );
      // Closing reloads the board, so the task drops out of its column
      onClose();
    } catch (err) {
      // Destructive and one-shot: say so rather than leaving the modal sitting there
      alert(err.message || "Failed to delete task");
    }
  };

  // Member Assignment
  const handleAssignMember = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      const res = await fetchWithAuth(
        `/boards/${boardId}/cards/${cardId}/tasks/${taskId}/assign`,
        {
          method: "POST",
          body: JSON.stringify({ memberId: selectedMember }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;
        throw new Error(detail || data.error || "Failed to assign member");
      }
      setSelectedMember("");
      loadTaskDetails();
    } catch (err) {
      console.error("Failed to assign member", err);
      alert(err.message || "Failed to assign member");
    }
  };

  const handleRemoveAssignee = async (memberId) => {
    try {
      const res = await fetchWithAuth(
        `/boards/${boardId}/cards/${cardId}/tasks/${taskId}/assign/${memberId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;
        throw new Error(detail || data.error || "Failed to remove assignee");
      }
      loadTaskDetails();
    } catch (err) {
      console.error("Failed to remove assignee", err);
      alert(err.message || "Failed to remove assignee");
    }
  };

  const handleRelatedDocsChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUploadFiles = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_URL}/boards/${boardId}/cards/${cardId}/tasks/${taskId}/attachments`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message;
          throw new Error(detail || data.error || "Failed to upload file");
        }
      }
      setSelectedFiles([]);
      setFileInputKey(Date.now());
      loadTaskDetails();
    } catch (err) {
      console.error("Failed to upload files", err);
      alert(err.message || "Failed to upload files");
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    try {
      const res = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/attachments/${attachmentId}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        throw new Error(detail || data.error || 'Failed to remove file');
      }
      loadTaskDetails();
    } catch (err) {
      console.error("Failed to remove file", err);
      alert(err.message || "Failed to remove file");
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      const res = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        throw new Error(detail || data.error || 'Failed to post comment');
      }
      setCommentText("");
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to post comment', err);
      alert(err.message || 'Failed to post comment');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      const res = await fetchWithAuth(`/boards/${boardId}/cards/${cardId}/tasks/${taskId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        throw new Error(detail || data.error || 'Failed to delete comment');
      }
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to delete comment', err);
      alert(err.message || 'Failed to delete comment');
    }
  };
  // ---- Timeline ----

  // The deadline that is actually saved, not whatever is currently typed in the
  // picker: scheduling an unsaved date would put the team on the wrong meeting.
  const savedDue = task?.dueDate ? new Date(task.dueDate) : null;
  const dueIsValid = savedDue && !Number.isNaN(savedDue.getTime());
  const isOverdue = dueIsValid && savedDue < new Date() && status !== "Done";
  const isUnsaved = dueDate !== isoToLocalInput(task?.dueDate);

  const assigneeEmails = assigned
    .map((a) => members.find((m) => m.id === a.memberId)?.email)
    .filter(Boolean);

  /**
   * Google only ever writes to the calendar of the person clicking, so the
   * assignees go on as guests (`add`): they receive an invitation and the event
   * lands in their calendar once they accept. Writing into someone else's
   * calendar directly would need each of them to connect a Google account.
   */
  const googleCalendarUrl = () => {
    if (!dueIsValid) return null;
    const end = new Date(savedDue.getTime() + 60 * 60 * 1000); // 1h block
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `[Deadline] ${task.title}`,
      dates: `${toGoogleStamp(savedDue)}/${toGoogleStamp(end)}`,
      details: `${task.description || "No description"}\n\nBoard task: ${window.location.href}`,
    });
    if (assigneeEmails.length) params.set("add", assigneeEmails.join(","));
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "800px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                fontWeight: "bold",
                color: "var(--accent-primary)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <CheckSquare style={{ width: 12, height: 12 }} />
              Task Workspace Details
            </span>
            <h2
              style={{ fontSize: "20px", fontWeight: "800", marginTop: "4px" }}
            >
              {task?.title}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {canEditContent && (
              <button
                type="button"
                onClick={handleDeleteTask}
                disabled={!canDeleteTask}
                title={
                  canDeleteTask
                    ? "Delete Task"
                    : "Only the board owner or a leader can delete a task"
                }
                className="danger"
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                <Trash style={{ width: 14, height: 14 }} />
                Delete Task
              </button>
            )}
            <button
              onClick={onClose}
              className="secondary"
              style={{ padding: "6px", borderRadius: "50%" }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {/* Content columns split */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "24px",
            flexWrap: "wrap",
          }}
        >
          {/* Column Left: Main forms */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            {/* Task Details edit form */}
            <form
              onSubmit={handleUpdateDetails}
              className="glass-panel"
              style={{ padding: "16px", background: "rgba(255,255,255,0.015)" }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  marginBottom: "14px",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                }}
              >
                General Settings
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
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
                  <select
                    id="task-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="Icebox">Icebox</option>
                    <option value="Backlog">Backlog</option>
                    <option value="On Going">On Going</option>
                    <option value="Waiting for Review">
                      Waiting for Review
                    </option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="task-due">Deadline</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      id="task-due"
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      disabled={!canSetDeadline}
                      title={canSetDeadline ? undefined : deadlineLockedReason}
                      style={{ flex: 1 }}
                    />
                    {dueDate && canSetDeadline && (
                      <button
                        type="button"
                        onClick={() => setDueDate("")}
                        className="secondary"
                        title="Clear the deadline"
                        style={{ padding: "8px 12px", fontSize: "12px" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {!canSetDeadline && (
                    <p
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "6px",
                      }}
                    >
                      {deadlineLockedReason}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="primary"
                  style={{
                    alignSelf: "flex-end",
                    padding: "8px 16px",
                    fontSize: "12px",
                  }}
                >
                  Save General details
                </button>
              </div>
            </form>

            {/* Task Assignees management */}
            <div
              className="glass-panel"
              style={{ padding: "16px", background: "rgba(255,255,255,0.015)" }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  marginBottom: "14px",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                }}
              >
                Assigned Team Members ({assigned.length})
              </h3>

              {/* Member Assign form */}
              <form
                onSubmit={handleAssignMember}
                style={{ display: "flex", gap: "10px", marginBottom: "16px" }}
              >
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Choose team member</option>
                  {members
                    .filter((m) => !assigned.some((a) => a.memberId === m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                </select>
                <button
                  type="submit"
                  className="primary"
                  style={{ padding: "8px 12px", fontSize: "12px" }}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                  Assign
                </button>
              </form>

              {/* Assigned list */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {assigned.map((assigneeObj) => {
                  const memberInfo = members.find(
                    (m) => m.id === assigneeObj.memberId,
                  );
                  // Render the row even when the person has left the board. Hiding it
                  // made the assignment invisible *and* impossible to remove.
                  return (
                    <div
                      key={assigneeObj.memberId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--border-radius-sm)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {memberInfo ? (
                          <img
                            src={memberInfo.avatarUrl}
                            alt="Avatar"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                            }}
                          />
                        ) : (
                          <User
                            style={{
                              width: 22,
                              height: 22,
                              color: "var(--text-muted)",
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: "500",
                            color: memberInfo ? undefined : "var(--text-muted)",
                          }}
                        >
                          {memberInfo ? memberInfo.name : "Former board member"}
                        </span>
                      </div>
                      {canEditContent && (
                        <button
                          type="button"
                          title="Remove from task"
                          onClick={() =>
                            handleRemoveAssignee(assigneeObj.memberId)
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color =
                              "var(--accent-danger)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = "var(--text-muted)")
                          }
                        >
                          <Trash style={{ width: 13, height: 13 }} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Related Documents*/}
            <div
              className="glass-panel"
              style={{ padding: "16px", background: "rgba(255,255,255,0.015)" }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  marginBottom: "14px",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                }}
              >
                Related Documents
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Uploaded attachments list */}
                {task?.attachments && task.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {task.attachments.map((fileObj) => (
                      <div 
                        key={fileObj.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '8px 12px', 
                          background: 'rgba(255,255,255,0.02)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: 'var(--border-radius-sm)' 
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {/* Opens the in-app viewer: a plain link would only
                                download anything the browser cannot render. */}
                            <button
                              type="button"
                              onClick={() => setPreviewFile(fileObj)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                font: 'inherit',
                                cursor: 'pointer',
                                color: 'var(--accent-primary)',
                              }}
                              title="Xem tệp"
                            >
                              {fileObj.name}
                            </button>
                            {fileObj.size && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                ({(fileObj.size / 1024).toFixed(1)} KB) · <a href={fileObj.url} download={fileObj.name} style={{ color: 'var(--accent-primary)', textDecoration: 'underline', fontSize: '11px' }}>Download</a>
                              </span>
                            )}
                          </span>
                        </div>
                        {canEditContent && (
                          <button 
                            type="button" 
                            title="Remove file" 
                            onClick={() => handleRemoveAttachment(fileObj.id)} 
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-danger)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                          >
                            <Trash style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/**related-docs */}
                <div>
                  {/* Everything FilePreviewModal can display, so anything
                      uploaded here can also be opened here. */}
                  <input
                    key={fileInputKey}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.odt,.ods,.txt,.md,.json,.xml,.zip,image/*,video/*,audio/*"
                    onChange={handleRelatedDocsChange}
                  />
                </div>
                <button
                  type="button"
                  className="primary" 
                  disabled={selectedFiles.length === 0}
                  style={{
                    alignSelf: "flex-end",
                    padding: "8px 16px",
                    fontSize: "12px",
                  }}
                  onClick={handleUploadFiles}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                  Upload
                </button>
              </div>
            </div>

            {/* Notes / Discussion Section */}
            <div
              className="glass-panel"
              style={{ padding: "16px", background: "rgba(255,255,255,0.015)" }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  marginBottom: "14px",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                }}
              >
                Discussion & Notes
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {/* Notes List */}
                {task?.comments && task.comments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                    {task.comments.map((comment) => {
                      const isAuthor = comment.authorId === user?.id;
                      const isManager = canDeleteTask; // owner or leader
                      const canDeleteComment = isAuthor || isManager;
                      
                      return (
                        <div 
                          key={comment.id}
                          style={{
                            display: "flex",
                            gap: "10px",
                            padding: "10px",
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--border-radius-sm)",
                            alignItems: "flex-start",
                          }}
                        >
                          {comment.authorAvatarUrl ? (
                            <img 
                              src={comment.authorAvatarUrl} 
                              alt="Avatar" 
                              style={{ width: 28, height: 28, borderRadius: "50%" }} 
                            />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <User style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--accent-primary)" }}>
                                {comment.authorName}
                              </span>
                              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                                {new Date(comment.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p style={{ fontSize: "13px", color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, lineHeight: 1.4 }}>
                              {comment.text}
                            </p>
                          </div>
                          {canDeleteComment && (
                            <button
                              type="button"
                              title="Delete note"
                              onClick={() => handleDeleteComment(comment.id)}
                              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-danger)")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                            >
                              <Trash style={{ width: 12, height: 12 }} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                    No notes or comments yet. Start the discussion below!
                  </p>
                )}

                {/* Add Note Form */}
                <form onSubmit={handlePostComment} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <textarea
                    rows="2"
                    placeholder="Write a note or comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: "rgba(0,0,0,0.2)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--border-radius-sm)",
                      color: "var(--text-primary)",
                      resize: "vertical",
                    }}
                  />
                  <button
                    type="submit"
                    className="primary"
                    disabled={!commentText.trim()}
                    style={{
                      alignSelf: "flex-end",
                      padding: "6px 12px",
                      fontSize: "12px",
                    }}
                  >
                    Post Note
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Column Right: Timeline */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <div
              className="glass-panel"
              style={{ padding: "16px", background: "rgba(255,255,255,0.015)" }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  marginBottom: "14px",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Calendar style={{ width: 16, height: 16 }} />
                Timeline
              </h3>

              {!dueIsValid ? (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  No deadline yet. Set one under{" "}
                  <strong>General Settings</strong> and save it, then you can
                  put it on Google Calendar from here.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  {/* The saved deadline */}
                  <div
                    style={{
                      padding: "12px 14px",
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${isOverdue ? "var(--accent-danger)" : "var(--border-color)"}`,
                      borderRadius: "var(--border-radius-sm)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "4px",
                      }}
                    >
                      Due
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>
                      {savedDue.toLocaleString()}
                    </div>
                    {isOverdue && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--accent-danger)",
                          marginTop: "6px",
                        }}
                      >
                        <AlertCircle style={{ width: 12, height: 12 }} />
                        Overdue
                      </div>
                    )}
                  </div>

                  {/* Who the invitation goes to */}
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "6px",
                      }}
                    >
                      Guests ({assigneeEmails.length})
                    </div>
                    {assigneeEmails.length === 0 ? (
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          lineHeight: 1.6,
                        }}
                      >
                        Nobody is assigned, so the event would be for you alone.
                        Assign someone first to invite them.
                      </p>
                    ) : (
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          wordBreak: "break-word",
                          lineHeight: 1.6,
                        }}
                      >
                        {assigneeEmails.join(", ")}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        googleCalendarUrl(),
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    className="primary"
                    style={{ width: "100%", padding: "10px", fontSize: "12px" }}
                  >
                    <CalendarPlus style={{ width: 14, height: 14 }} />
                    Schedule on Google Calendar
                  </button>

                  {isUnsaved && (
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--accent-warning)",
                        lineHeight: 1.6,
                      }}
                    >
                      The date in the form is not saved yet, so the event would
                      use the deadline shown above. Save first to schedule the
                      new one.
                    </p>
                  )}

                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    Opens Google Calendar with the event filled in. Assignees
                    are added as guests and receive an invitation, which lands
                    in their own calendar once they accept.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inside the overlay rather than beside it: .modal-overlay is a
          full-viewport fixed box, so the viewer still covers the screen, and
          its backdrop click cannot reach this modal's own onClose. */}
      {previewFile && (
        <FilePreviewModal
          boardId={boardId}
          cardId={cardId}
          taskId={taskId}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
