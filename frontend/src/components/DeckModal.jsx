import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Download, FileText, Presentation, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Mirrors the server limits in backend/src/slides/dto/slides.dto.ts, so the UI
// never sends a request the API would answer with a 400.
const MAX_SOURCES = 20;
const MIN_SLIDES = 3;
const MAX_SLIDES = 30;
const MAX_BULLETS = 6;

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Nest puts validation failures in `message` as an array. */
const readError = async (res, fallback) => {
  const data = await res.json().catch(() => ({}));
  const detail = Array.isArray(data.message) ? data.message.join(', ') : data.message;
  return detail || data.error || fallback;
};

/**
 * Picks files uploaded to the board's tasks and turns them into a .pptx.
 *
 * Two steps on purpose, the way NotebookLM works: the outline comes back for
 * review and can be edited here, and only then is the deck rendered. Downloading
 * therefore never re-runs the model and never overwrites the edits.
 */
export default function DeckModal({ boardId, boardName, onClose }) {
  const { fetchWithAuth } = useAuth();

  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState([]);
  const [modelAvailable, setModelAvailable] = useState(true);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [slideCount, setSlideCount] = useState(10);
  const [language, setLanguage] = useState('vi');
  const [audience, setAudience] = useState('');

  const [outline, setOutline] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchWithAuth(`/boards/${boardId}/slides/sources`);
        if (!res.ok) throw new Error(await readError(res, 'Không tải được danh sách tệp'));
        const data = await res.json();
        if (cancelled) return;
        setSources(data.sources || []);
        setModelAvailable(Boolean(data.modelAvailable));
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
  }, [boardId, fetchWithAuth]);

  // Files stay grouped under the task they were uploaded to - that is how the
  // person choosing them remembers what each file is.
  const groups = useMemo(() => {
    const byTask = new Map();
    for (const source of sources) {
      if (!byTask.has(source.taskId)) {
        byTask.set(source.taskId, {
          taskId: source.taskId,
          taskTitle: source.taskTitle,
          cardName: source.cardName,
          files: [],
        });
      }
      byTask.get(source.taskId).files.push(source);
    }
    return [...byTask.values()];
  }, [sources]);

  const readableCount = sources.filter((source) => source.supported).length;
  const atLimit = selected.length >= MAX_SOURCES;

  const toggle = (source) => {
    if (!source.supported) return;
    setSelected((current) => {
      if (current.includes(source.id)) return current.filter((id) => id !== source.id);
      if (current.length >= MAX_SOURCES) return current;
      return [...current, source.id];
    });
  };

  const selectAllReadable = () => {
    setSelected(
      sources
        .filter((source) => source.supported)
        .slice(0, MAX_SOURCES)
        .map((source) => source.id),
    );
  };

  const generateOutline = async () => {
    setBusy('outline');
    setError('');
    try {
      const res = await fetchWithAuth(`/boards/${boardId}/slides/outline`, {
        method: 'POST',
        body: JSON.stringify({
          sourceIds: selected,
          title: title.trim() || undefined,
          slideCount,
          language,
          audience: audience.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Không tạo được dàn ý'));
      setOutline(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const downloadDeck = async () => {
    setBusy('pptx');
    setError('');
    try {
      const res = await fetchWithAuth(`/boards/${boardId}/slides/pptx`, {
        method: 'POST',
        body: JSON.stringify({
          title: outline.title,
          subtitle: outline.subtitle,
          slides: outline.slides.map((slide) => ({
            title: slide.title,
            bullets: slide.bullets.filter(Boolean).slice(0, MAX_BULLETS),
            notes: slide.notes || undefined,
          })),
          sourceNames: (outline.sources || []).map((source) => source.name),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Không tạo được file .pptx'));

      // The request needs an Authorization header, so the file arrives as a blob
      // rather than through a plain link, and is handed to the browser here.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(outline.title || 'lulu-deck').replace(/[\\/:*?"<>|]/g, '-')}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const updateSlide = (index, patch) => {
    setOutline((current) => ({
      ...current,
      slides: current.slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)),
    }));
  };

  const label = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' };
  const panel = {
    padding: '14px',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border-color)',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel"
        style={{ maxWidth: '860px' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Presentation style={{ width: 18, height: 18, color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '20px', fontWeight: 800 }}>Tạo slide từ tệp đính kèm</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {outline
                ? 'Xem lại và chỉnh dàn ý trước khi tải file .pptx'
                : `Chọn các tệp đã upload trong bảng "${boardName}" làm nguồn`}
            </div>
          </div>
          <button className="secondary" onClick={onClose} style={{ padding: '6px', borderRadius: '50%' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {error && (
          <div
            style={{
              ...panel,
              marginBottom: '16px',
              borderColor: 'var(--accent-danger)',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              fontSize: '13px',
            }}
          >
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, color: 'var(--accent-danger)' }} />
            <span>{error}</span>
          </div>
        )}

        {!outline ? (
          <>
            {loading ? (
              <div style={{ ...panel, textAlign: 'center', color: 'var(--text-muted)' }}>
                Đang tải danh sách tệp…
              </div>
            ) : !sources.length ? (
              <div style={{ ...panel, textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Bảng này chưa có tệp đính kèm nào. Thành viên hãy mở một công việc và upload tệp trước.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    Đã chọn {selected.length}/{Math.min(readableCount, MAX_SOURCES)} tệp đọc được
                    {atLimit ? ` · tối đa ${MAX_SOURCES} tệp` : ''}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={selectAllReadable}
                      disabled={!readableCount}
                    >
                      Chọn tất cả
                    </button>
                    <button
                      className="secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => setSelected([])}
                      disabled={!selected.length}
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '38vh', overflowY: 'auto', display: 'grid', gap: '10px' }}>
                  {groups.map((group) => (
                    <div key={group.taskId} style={panel}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>
                        {group.taskTitle}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        {group.cardName}
                      </div>

                      <div style={{ display: 'grid', gap: '6px' }}>
                        {group.files.map((source) => {
                          const checked = selected.includes(source.id);
                          const blocked = !source.supported || (!checked && atLimit);
                          return (
                            <button
                              key={source.id}
                              className="secondary"
                              onClick={() => toggle(source)}
                              disabled={blocked}
                              title={
                                source.supported
                                  ? undefined
                                  : 'Chỉ đọc được PDF, DOCX và tệp văn bản'
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                textAlign: 'left',
                                padding: '8px 10px',
                                fontSize: '13px',
                                fontWeight: 500,
                                borderColor: checked ? 'var(--accent-primary)' : undefined,
                                background: checked ? 'rgba(99,102,241,0.14)' : undefined,
                              }}
                            >
                              <span
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 4,
                                  flexShrink: 0,
                                  border: '1px solid var(--border-color)',
                                  background: checked ? 'var(--accent-primary)' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {checked && <Check style={{ width: 11, height: 11 }} />}
                              </span>
                              <FileText style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.7 }} />
                              <span
                                style={{
                                  flex: 1,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {source.name}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                                {source.supported ? formatSize(source.size) : 'không đọc được'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ ...panel, marginTop: '16px', display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '2 1 260px' }}>
                      <label style={label}>Tiêu đề bài thuyết trình (để trống cho AI tự đặt)</label>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={boardName}
                        maxLength={120}
                      />
                    </div>
                    <div style={{ flex: '0 1 110px' }}>
                      <label style={label}>Số slide</label>
                      <input
                        type="number"
                        min={MIN_SLIDES}
                        max={MAX_SLIDES}
                        value={slideCount}
                        onChange={(event) =>
                          setSlideCount(
                            Math.max(
                              MIN_SLIDES,
                              Math.min(MAX_SLIDES, Number(event.target.value) || MIN_SLIDES),
                            ),
                          )
                        }
                      />
                    </div>
                    <div style={{ flex: '0 1 140px' }}>
                      <label style={label}>Ngôn ngữ</label>
                      <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={label}>Người nghe / trọng tâm (không bắt buộc)</label>
                    <input
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      placeholder="VD: báo cáo cho khách hàng, nhấn vào tiến độ và rủi ro"
                      maxLength={300}
                    />
                  </div>
                  {!modelAvailable && (
                    <div style={{ fontSize: '12px', color: 'var(--accent-warning)' }}>
                      Máy chủ chưa cấu hình GEMINI_API_KEY, nên slide sẽ là trích đoạn nguyên văn từ tài
                      liệu thay vì được tóm tắt.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                  <button className="secondary" onClick={onClose}>
                    Huỷ
                  </button>
                  <button
                    className="primary"
                    onClick={generateOutline}
                    disabled={!selected.length || busy === 'outline'}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Sparkles style={{ width: 15, height: 15 }} />
                    {busy === 'outline' ? 'Đang đọc tài liệu…' : 'Tạo dàn ý'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {outline.warnings?.length > 0 && (
              <div style={{ ...panel, marginBottom: '14px', borderColor: 'var(--accent-warning)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Lưu ý</div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {outline.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ ...panel, marginBottom: '14px' }}>
              <label style={label}>Tiêu đề</label>
              <input
                value={outline.title}
                onChange={(event) => setOutline({ ...outline, title: event.target.value })}
                maxLength={120}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                {outline.slides.length} slide ·{' '}
                {outline.generatedBy === 'gemini' ? 'do AI tóm tắt' : 'trích nguyên văn'} · nguồn:{' '}
                {(outline.sources || []).map((source) => source.name).join(', ')}
              </div>
            </div>

            <div style={{ maxHeight: '44vh', overflowY: 'auto', display: 'grid', gap: '10px' }}>
              {outline.slides.map((slide, index) => (
                <div key={index} style={panel}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        minWidth: '22px',
                      }}
                    >
                      {index + 1}
                    </span>
                    <input
                      value={slide.title}
                      onChange={(event) => updateSlide(index, { title: event.target.value })}
                      maxLength={200}
                      style={{ fontWeight: 700 }}
                    />
                  </div>
                  <textarea
                    rows={Math.min(MAX_BULLETS, Math.max(2, slide.bullets.length))}
                    value={slide.bullets.join('\n')}
                    onChange={(event) =>
                      updateSlide(index, {
                        // One bullet per line, capped where the server caps it.
                        bullets: event.target.value.split('\n').slice(0, MAX_BULLETS),
                      })
                    }
                    placeholder="Mỗi dòng là một gạch đầu dòng"
                    style={{ fontSize: '13px' }}
                  />
                  {slide.notes && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Ghi chú người trình bày: {slide.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                marginTop: '20px',
                flexWrap: 'wrap',
              }}
            >
              <button className="secondary" onClick={() => setOutline(null)}>
                Chọn nguồn khác
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="secondary"
                  onClick={generateOutline}
                  disabled={busy === 'outline'}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <RefreshCw style={{ width: 15, height: 15 }} />
                  {busy === 'outline' ? 'Đang tạo lại…' : 'Tạo lại dàn ý'}
                </button>
                <button
                  className="primary"
                  onClick={downloadDeck}
                  disabled={busy === 'pptx'}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Download style={{ width: 15, height: 15 }} />
                  {busy === 'pptx' ? 'Đang dựng file…' : 'Tải file .pptx'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
