'use client';

import './notes.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { shortDate } from '../../lib/catalog';

// Who wrote a note. Kept sticky in the form across submissions.
const PEOPLE = [
  { value: 'Jack', label: 'Jack' },
  { value: 'Jackson', label: 'Jackson' },
];

// Preset note colors. `value` is stored in notes.color; null = plain paper.
// Each maps to a --note-* tint token pair defined in notes.css so light and
// dark both stay readable.
export const NOTE_COLORS = [
  { value: null, label: 'None' },
  { value: 'red', label: 'Red' },
  { value: 'amber', label: 'Amber' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'slate', label: 'Slate' },
];

// Storage bucket for note images (public bucket, shared with requests).
const FILES_BUCKET = 'request-files';

// Make a filename safe for a storage key: keep letters, digits, dot, dash,
// underscore; collapse everything else to a dash.
function safeFileName(name) {
  return (
    String(name || 'file')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
  );
}

// Upload image files under notes/<noteId>/ and return [{name, url}] for each.
// Throws on the first hard failure so the caller can surface it on the error
// line. Exported so the floating NotesBubble can reuse the exact path scheme.
export async function uploadNoteImages(noteId, files) {
  const out = [];
  let i = 0;
  for (const file of files) {
    const path = `notes/${noteId}/${Date.now()}-${i}-${safeFileName(
      file.name
    )}`;
    i += 1;
    const { error: upErr } = await supabase.storage
      .from(FILES_BUCKET)
      .upload(path, file);
    if (upErr) {
      throw new Error(upErr.message || 'Image upload failed.');
    }
    const { data: pub } = supabase.storage
      .from(FILES_BUCKET)
      .getPublicUrl(path);
    out.push({ name: file.name, url: pub?.publicUrl || '' });
  }
  return out;
}

// Pinned first, then newest created_at first. Stable for equal keys.
function sortNotes(list) {
  return [...list].sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = a.created_at || '';
    const tb = b.created_at || '';
    return tb < ta ? -1 : tb > ta ? 1 : 0;
  });
}

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState('all');
  // Which note is open in the full-text overlay (id), or null when closed.
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load notes.');
      setLoading(false);
      return;
    }
    setNotes(sortNotes(data || []));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when notes change on any device.
  useRealtime(['notes'], load);

  const toggleDone = useCallback(
    async (note) => {
      const next = !note.done;
      // Optimistic update.
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, done: next } : n))
      );
      const { error } = await supabase
        .from('notes')
        .update({ done: next })
        .eq('id', note.id);
      if (error) {
        setLoadError(error.message || 'Failed to update note.');
        load();
      }
    },
    [load]
  );

  const togglePinned = useCallback(
    async (note) => {
      const next = !note.pinned;
      // Optimistic update + re-sort so it jumps to the top immediately.
      setNotes((prev) =>
        sortNotes(
          prev.map((n) => (n.id === note.id ? { ...n, pinned: next } : n))
        )
      );
      const { error } = await supabase
        .from('notes')
        .update({ pinned: next })
        .eq('id', note.id);
      if (error) {
        setLoadError(error.message || 'Failed to update note.');
        load();
      }
    },
    [load]
  );

  const handleDelete = useCallback(
    async (note) => {
      if (!window.confirm('Delete this note? This cannot be undone.')) return;
      const { error } = await supabase.from('notes').delete().eq('id', note.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete note.');
        return;
      }
      load();
    },
    [load]
  );

  // Search (case-insensitive body) + color filter, over the already-sorted list.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (q && !String(n.body || '').toLowerCase().includes(q)) return false;
      if (colorFilter !== 'all') {
        const c = n.color || null;
        if (colorFilter === 'none' ? c != null : c !== colorFilter)
          return false;
      }
      return true;
    });
  }, [notes, query, colorFilter]);

  // The note currently open in the overlay (or null). Pulled from the live
  // list so realtime edits to an open note stay in sync.
  const openNote = useMemo(
    () => notes.find((n) => n.id === openId) || null,
    [notes, openId]
  );

  return (
    <div className="notes">
      <NoteForm onSaved={load} onError={setLoadError} />

      {/* Notes list */}
      <div className="card">
        <div className="card-label">Notes</div>

        {/* Search + color filter */}
        <div className="note-tools">
          <input
            type="search"
            className="input note-search"
            value={query}
            placeholder="Search notes…"
            aria-label="Search notes"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="note-filter" role="group" aria-label="Filter by color">
            <button
              type="button"
              className={`note-chip${colorFilter === 'all' ? ' on' : ''}`}
              onClick={() => setColorFilter('all')}
            >
              All
            </button>
            {NOTE_COLORS.map((c) => {
              const key = c.value == null ? 'none' : c.value;
              return (
                <button
                  key={key}
                  type="button"
                  className={`note-swatch${
                    colorFilter === key ? ' on' : ''
                  }`}
                  data-color={c.value || ''}
                  aria-label={`Filter ${c.label}`}
                  aria-pressed={colorFilter === key}
                  title={c.label}
                  onClick={() => setColorFilter(key)}
                />
              );
            })}
          </div>
        </div>

        {loadError ? <div className="form-error">{loadError}</div> : null}

        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="muted note-empty load-line">
            {notes.length === 0 ? 'No notes yet.' : 'No notes match.'}
          </div>
        ) : (
          <div className="note-list">
            {visible.map((note) => (
              <div
                className={`note-row${note.done ? ' note-done' : ''}${
                  note.color ? ' note-tinted' : ''
                }`}
                data-color={note.color || ''}
                key={note.id}
              >
                <button
                  type="button"
                  className={`note-check${note.done ? ' on' : ''}`}
                  onClick={() => toggleDone(note)}
                  aria-pressed={note.done}
                  aria-label={note.done ? 'Mark not done' : 'Mark done'}
                >
                  <span className="note-check-box" aria-hidden="true" />
                </button>
                <div className="note-main">
                  {/* Tap the body to open the note in full. Images and the
                      byline sit outside the button so image links still work. */}
                  <button
                    type="button"
                    className="note-open"
                    onClick={() => setOpenId(note.id)}
                    aria-label="Open note"
                    title="Open note"
                  >
                    <span className="note-body">{note.body}</span>
                  </button>
                  <NoteImages images={note.images} />
                  <span className="note-by">
                    by {note.author || 'Someone'}
                    {note.created_at
                      ? ` · ${shortDate(dateOnly(note.created_at))}`
                      : ''}
                  </span>
                </div>
                <div className="note-actions">
                  <button
                    type="button"
                    className={`note-pin${note.pinned ? ' on' : ''}`}
                    onClick={() => togglePinned(note)}
                    aria-pressed={note.pinned}
                    aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                    title={note.pinned ? 'Unpin' : 'Pin'}
                  >
                    <span className="note-pin-icon" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="note-del"
                    onClick={() => handleDelete(note)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openNote ? (
        <NoteDetail note={openNote} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

// Pull the YYYY-MM-DD out of a timestamptz so shortDate can format it locally.
function dateOnly(ts) {
  return String(ts).slice(0, 10);
}

/* ---------------- Note images ---------------- */

// Render image thumbnails for a note. Reserved height so the row doesn't shift
// as thumbnails load. Clicking opens the full image in a new tab.
function NoteImages({ images }) {
  const list = Array.isArray(images) ? images.filter((im) => im && im.url) : [];
  if (list.length === 0) return null;
  return (
    <div className="note-imgs">
      {list.map((im, i) => (
        <a
          key={`${im.url}-${i}`}
          className="note-img"
          href={im.url}
          target="_blank"
          rel="noopener noreferrer"
          title={im.name || 'image'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.url} alt={im.name || 'note image'} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/* ---------------- Note detail overlay ----------------
   Opens a note in full: untruncated body (pre-wrap), any images, and a Copy
   button. Mirrors the products/models overlay: Escape + click-outside close,
   body scroll lock while open. */

function NoteDetail({ note, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Copy the full note text. Fall back to a manual-select hint if the
  // clipboard API is unavailable (older / non-secure contexts).
  async function copy() {
    const text = note.body || '';
    try {
      if (!navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(text);
      setCopyErr(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyErr(true);
      setTimeout(() => setCopyErr(false), 3000);
    }
  }

  return (
    <div
      className="note-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Note"
      onClick={onClose}
    >
      <div className="note-sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="note-sheet-close"
          onClick={onClose}
          aria-label="Close"
        >
          Close
        </button>

        <div className="note-sheet-scroll">
          <div className="note-sheet-body">
            {/* Full text, whitespace + line breaks preserved. Selectable so a
                manual copy is always possible even if the button fails. */}
            <p className="note-full">{note.body}</p>

            <NoteImages images={note.images} />

            <span className="note-by">
              by {note.author || 'Someone'}
              {note.created_at
                ? ` · ${shortDate(dateOnly(note.created_at))}`
                : ''}
            </span>

            {copyErr ? (
              <div className="muted note-copy-hint">
                Couldn&apos;t copy automatically — select the text above and
                copy it.
              </div>
            ) : null}

            <div className="note-sheet-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Note form ---------------- */

function NoteForm({ onSaved, onError }) {
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState(PEOPLE[0].value);
  const [color, setColor] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!body.trim()) {
      setError('Note is required.');
      return;
    }

    setSaving(true);

    // Insert the note first so images can live under notes/<id>/.
    const { data: inserted, error: err } = await supabase
      .from('notes')
      .insert({ body: body.trim(), author, color, done: false })
      .select()
      .single();

    if (err || !inserted) {
      setSaving(false);
      setError((err && err.message) || 'Failed to add note.');
      return;
    }

    // Upload any attached images, then patch the note with their URLs.
    if (files.length) {
      try {
        const uploaded = await uploadNoteImages(inserted.id, files);
        const { error: upErr } = await supabase
          .from('notes')
          .update({ images: uploaded })
          .eq('id', inserted.id);
        if (upErr) throw new Error(upErr.message || 'Failed to save images.');
      } catch (uploadErr) {
        setSaving(false);
        setError(uploadErr.message || 'Image upload failed.');
        onSaved();
        return;
      }
    }

    setSaving(false);
    // Clear the note + images but keep author + color sticky.
    setBody('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onError) onError('');
    onSaved();
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">New note</div>

      <p className="note-intro muted">Dev notes and progress log.</p>

      <div className="field">
        <label className="label">Note</label>
        <textarea
          className="textarea"
          value={body}
          placeholder="What happened / what's next?"
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Color</label>
        <div className="note-picker" role="group" aria-label="Note color">
          {NOTE_COLORS.map((c) => {
            const active = (color || null) === c.value;
            return (
              <button
                key={c.value == null ? 'none' : c.value}
                type="button"
                className={`note-swatch${active ? ' on' : ''}`}
                data-color={c.value || ''}
                aria-label={c.label}
                aria-pressed={active}
                title={c.label}
                onClick={() => setColor(c.value)}
              />
            );
          })}
        </div>
      </div>

      <div className="field">
        <label className="label">Images</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="note-file-input"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {files.length ? (
          <div className="note-file-names muted">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="note-file-name">
                {f.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="note-file-hint muted">
            Optional - attach screenshots or reference images.
          </span>
        )}
      </div>

      <div className="field">
        <label className="label">Author</label>
        <div className="seg">
          {PEOPLE.map((p) => (
            <button
              key={p.value}
              type="button"
              className={author === p.value ? 'on' : ''}
              onClick={() => setAuthor(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add note'}
        </button>
      </div>
    </form>
  );
}
