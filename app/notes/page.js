'use client';

import './notes.css';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { shortDate } from '../../lib/catalog';

// Who wrote a note. Kept sticky in the form across submissions.
const PEOPLE = [
  { value: 'Jack', label: 'Jack' },
  { value: 'Jackson', label: 'Jackson' },
];

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load notes.');
      setLoading(false);
      return;
    }
    setNotes(data || []);
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

  return (
    <div className="notes">
      <NoteForm onSaved={load} onError={setLoadError} />

      {/* Notes list */}
      <div className="card">
        <div className="card-label">Notes</div>

        {loadError ? <div className="form-error">{loadError}</div> : null}

        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="muted note-empty load-line">No notes yet.</div>
        ) : (
          <div className="note-list">
            {notes.map((note) => (
              <div
                className={`note-row${note.done ? ' note-done' : ''}`}
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
                  <span className="note-body">{note.body}</span>
                  <span className="note-by">
                    by {note.author || 'Someone'}
                    {note.created_at
                      ? ` · ${shortDate(dateOnly(note.created_at))}`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="note-del"
                  onClick={() => handleDelete(note)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Pull the YYYY-MM-DD out of a timestamptz so shortDate can format it locally.
function dateOnly(ts) {
  return String(ts).slice(0, 10);
}

/* ---------------- Note form ---------------- */

function NoteForm({ onSaved, onError }) {
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState(PEOPLE[0].value);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!body.trim()) {
      setError('Note is required.');
      return;
    }

    setSaving(true);
    const payload = {
      body: body.trim(),
      author,
      done: false,
    };
    const { error: err } = await supabase.from('notes').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to add note.');
      return;
    }
    // Clear the note but keep the author selection sticky.
    setBody('');
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
