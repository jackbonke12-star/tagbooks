'use client';

// Floating, global "quick note" bubble. Mounts once inside the PinGate (via
// Shell) so it only appears after unlock, on every page. A fixed button in the
// bottom-right opens a small bottom-right panel to jot an idea without
// navigating, plus a short list of the most recent notes (pinned first, then
// newest). Uses supabase directly + useRealtime(['notes']) so the panel stays
// live. Closes on outside click, the close button, Escape, or a route change.

import './NotesBubble.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/realtime';

const PEOPLE = [
  { value: 'Jack', label: 'Jack' },
  { value: 'Jackson', label: 'Jackson' },
];

const RECENT_LIMIT = 6;

export default function NotesBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState(PEOPLE[0].value);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  // Load the most recent notes (pinned first, then newest).
  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('notes')
      .select('id, body, author, color, pinned, created_at')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);
    if (err) return; // The full Notes page surfaces load errors; keep the bubble quiet.
    setNotes(data || []);
  }, []);

  // Only fetch when open (and keep it live while open).
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  useRealtime(['notes'], open ? load : () => {});

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Outside click + Escape close the panel. Only wired while open.
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!body.trim()) {
      setError('Note is required.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase
      .from('notes')
      .insert({ body: body.trim(), author, done: false });
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to add note.');
      return;
    }
    setBody('');
    load();
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`notes-bubble-btn${open ? ' on' : ''}`}
        aria-label={open ? 'Close quick notes' : 'Open quick notes'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="notes-bubble-plus" aria-hidden="true" />
        <span className="notes-bubble-label">Notes</span>
      </button>

      {open ? (
        <div
          className="notes-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Quick notes"
        >
          <div className="notes-panel-head">
            <span className="notes-panel-title">Quick note</span>
            <button
              type="button"
              className="notes-panel-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <form className="notes-panel-form" onSubmit={save}>
            <textarea
              className="textarea notes-panel-textarea"
              value={body}
              placeholder="Jot an idea…"
              aria-label="Note"
              onChange={(e) => setBody(e.target.value)}
            />

            <div className="notes-panel-row">
              <div className="seg notes-panel-seg">
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
              <button
                type="submit"
                className="btn btn-primary notes-panel-save"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>

            {error ? <div className="form-error">{error}</div> : null}
          </form>

          <div className="notes-panel-recent">
            <div className="notes-panel-recent-label">Recent</div>
            {notes.length === 0 ? (
              <div className="muted notes-panel-empty">No notes yet.</div>
            ) : (
              <ul className="notes-panel-list">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className={`notes-panel-item${
                      n.color ? ' tinted' : ''
                    }`}
                    data-color={n.color || ''}
                  >
                    {n.pinned ? (
                      <span
                        className="notes-panel-pin"
                        aria-label="Pinned"
                        title="Pinned"
                      />
                    ) : null}
                    <span className="notes-panel-item-body">{n.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
