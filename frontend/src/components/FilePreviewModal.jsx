import { useEffect, useState } from 'react';
import { AlertCircle, Download, ExternalLink, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Nest puts validation failures in `message` as an array. */
const readError = async (res, fallback) => {
  const data = await res.json().catch(() => ({}));
  const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
  return detail || data.error || fallback;
};

/**
 * Shows one task attachment without leaving the board.
 *
 * The browser only renders PDFs, images and media on its own; .docx, .xlsx and
 * .pptx are converted to HTML by the server (see backend/src/preview) and shown
 * here inside a sandboxed iframe - sandbox="" blocks scripts, forms and
 * navigation, and keeps the document's own styles away from the app's.
 */
export default function FilePreviewModal({ boardId, cardId, taskId, file, onClose }) {
  const { fetchWithAuth } = useAuth();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchWithAuth(
          `/boards/${boardId}/cards/${cardId}/tasks/${taskId}/attachments/${file.id}/preview`,
        );
        if (!res.ok) throw new Error(await readError(res, 'Không mở được tệp này'));
        const data = await res.json();
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [boardId, cardId, taskId, file.id, fetchWithAuth]);

  // Esc closes the viewer, the same as clicking the backdrop.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Links come from the preview: for a file in R2 they are signed and expire in
  // 15 minutes, so they are minted per request rather than stored on the task.
  // `file.url` is the fallback for older attachments still served from /uploads.
  const url = preview?.url || file.url;
  // Same file, but with a Content-Disposition that saves instead of rendering.
  const downloadUrl = preview?.downloadUrl || url;

  const frame = {
    width: '100%',
    height: '100%',
    border: 'none',
    borderRadius: '10px',
    background: '#6b7280',
  };
  const centred = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px',
  };

  const body = () => {
    if (loading) return <div style={centred}>Đang mở tệp…</div>;

    if (error) {
      return (
        <div style={centred}>
          <AlertCircle style={{ width: 22, height: 22, color: 'var(--accent-danger)' }} />
          <span>{error}</span>
        </div>
      );
    }

    switch (preview?.kind) {
      case 'html':
        return <iframe title={file.name} srcDoc={preview.html} sandbox="" style={frame} />;
      case 'pdf':
        // Not sandboxed: the browser's built-in PDF viewer needs to run, and the
        // file is served by our own API.
        return <iframe title={file.name} src={url} style={frame} />;
      case 'image':
        return (
          <div style={{ ...centred, padding: 0 }}>
            <img
              src={url}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
        );
      case 'video':
        return (
          <div style={{ ...centred, padding: 0 }}>
            <video src={url} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
          </div>
        );
      case 'audio':
        return (
          <div style={centred}>
            <audio src={url} controls style={{ width: 'min(420px, 100%)' }} />
          </div>
        );
      default:
        return (
          <div style={centred}>
            <AlertCircle style={{ width: 22, height: 22, color: 'var(--accent-warning)' }} />
            <span>{preview?.note || 'Định dạng này chưa xem trước được.'}</span>
            {url && (
              <a href={downloadUrl} download={file.name} style={downloadButton}>
                <Download style={{ width: 14, height: 14 }} />
                Tải tệp về
              </a>
            )}
          </div>
        );
    }
  };

  // A note next to the viewer only makes sense while something is being shown;
  // for an unsupported file it is the message in the middle of the panel.
  const note = preview?.kind !== 'unsupported' ? preview?.note : '';

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        // The viewer renders inside the task modal's overlay; without this the
        // backdrop click would close that one too.
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal-content glass-panel"
        style={{
          width: '94%',
          maxWidth: '1180px',
          height: '92vh',
          maxHeight: '92vh',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overflow: 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {preview?.format ? `.${preview.format}` : ''}
              {note ? ` · ${note}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {url && (
              <>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={headerButton}
                  title="Mở tệp gốc ở tab mới"
                >
                  <ExternalLink style={{ width: 14, height: 14 }} />
                </a>
                <a
                  href={downloadUrl}
                  download={file.name}
                  style={headerButton}
                  title="Tải về"
                >
                  <Download style={{ width: 14, height: 14 }} />
                </a>
              </>
            )}
            <button className="secondary" style={headerButton} onClick={onClose} title="Đóng">
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          {body()}
        </div>
      </div>
    </div>
  );
}

// index.css scopes its button styling to `button.secondary`, so the links that
// sit next to the close button carry that look themselves.
const headerButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  borderRadius: '50%',
  textDecoration: 'none',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

const downloadButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: 'var(--border-radius-sm)',
  background: 'linear-gradient(135deg, var(--accent-primary), #4f46e5)',
  color: '#fff',
};
