'use client';

import './requests.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { shortDate } from '../../lib/catalog';

// Request statuses and their tap-to-advance order: new -> building -> done -> new.
const STATUS_LABEL = { new: 'New', building: 'Building', done: 'Done' };
const NEXT_STATUS = { new: 'building', building: 'done', done: 'new' };

// Who submitted a request. Kept sticky in the form across submissions.
const PEOPLE = [
  { value: 'Jack', label: 'Jack' },
  { value: 'Jackson', label: 'Jackson' },
];

// Filter tabs for the list, ANDed with nothing else.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'building', label: 'Building' },
  { value: 'done', label: 'Done' },
];

// Priority segmented control + stamp labels. Defaults to medium.
const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
];
const PRIORITY_LABEL = { high: 'High', medium: 'Med', low: 'Low' };
// Sort weight: high first, then medium, then low.
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Optional request-type suggestions for the datalist.
const REQ_TYPES = ['Feature', 'Bug', 'Idea', 'Chore'];

// Storage bucket for request attachments (public: links are readable later).
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

// Upload a list of files for a request id, returning [{name, url}] for each
// that uploaded successfully. Throws on the first hard failure so callers can
// surface it. Paths are unique: `${requestId}/${Date.now()}-i-${safeName}`.
async function uploadRequestFiles(requestId, files) {
  const out = [];
  let i = 0;
  for (const file of files) {
    const path = `${requestId}/${Date.now()}-${i}-${safeFileName(file.name)}`;
    i += 1;
    const { error: upErr } = await supabase.storage
      .from(FILES_BUCKET)
      .upload(path, file);
    if (upErr) {
      throw new Error(upErr.message || 'File upload failed.');
    }
    const { data: pub } = supabase.storage
      .from(FILES_BUCKET)
      .getPublicUrl(path);
    out.push({ name: file.name, url: pub?.publicUrl || '' });
  }
  return out;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load requests.');
      setLoading(false);
      return;
    }
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when requests change on any device.
  useRealtime(['requests'], load);

  const advanceStatus = useCallback(
    async (req) => {
      const next = NEXT_STATUS[req.status] || 'new';
      if (next === req.status) return;
      // Optimistic update.
      setRequests((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, status: next } : r))
      );
      const { error } = await supabase
        .from('requests')
        .update({ status: next })
        .eq('id', req.id);
      if (error) {
        setLoadError(error.message || 'Failed to update request.');
        load();
      }
    },
    [load]
  );

  const handleDelete = useCallback(
    async (req) => {
      if (!window.confirm('Delete this request? This cannot be undone.')) return;
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', req.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete request.');
        return;
      }
      load();
    },
    [load]
  );

  // Attach one or more files to an existing request: upload, then merge the
  // new {name, url} entries onto the row's current files array and update it.
  const attachToExisting = useCallback(
    async (req, fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      let uploaded;
      try {
        uploaded = await uploadRequestFiles(req.id, files);
      } catch (err) {
        setLoadError(err.message || 'Failed to attach file.');
        return;
      }
      const merged = [...(Array.isArray(req.files) ? req.files : []), ...uploaded];
      const { error } = await supabase
        .from('requests')
        .update({ files: merged })
        .eq('id', req.id);
      if (error) {
        setLoadError(error.message || 'Failed to save attachment.');
        return;
      }
      setLoadError('');
      load();
    },
    [load]
  );

  // Counts per status for the filter labels.
  const counts = useMemo(() => {
    const c = { all: requests.length, new: 0, building: 0, done: 0 };
    for (const r of requests) {
      if (c[r.status] !== undefined) c[r.status] += 1;
    }
    return c;
  }, [requests]);

  const visible = useMemo(() => {
    const rows =
      filter === 'all'
        ? requests.slice()
        : requests.filter((r) => r.status === filter);
    // Priority high -> medium -> low, then newest first within a priority.
    rows.sort((a, b) => {
      const pr =
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
      if (pr !== 0) return pr;
      const ca = a.created_at || '';
      const cb = b.created_at || '';
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    });
    return rows;
  }, [requests, filter]);

  return (
    <div className="requests">
      <RequestForm
        editing={editing}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onCancelEdit={() => setEditing(null)}
        onError={setLoadError}
      />

      {/* Status filter */}
      <div className="seg request-filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={filter === f.value ? 'on' : ''}
            onClick={() => setFilter(f.value)}
          >
            {f.label} {counts[f.value]}
          </button>
        ))}
      </div>

      {/* Requests list */}
      <div className="card">
        <div className="card-label">Requests</div>

        {loadError ? <div className="form-error">{loadError}</div> : null}

        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="muted req-empty load-line">
            {filter !== 'all'
              ? 'No requests here.'
              : 'No requests yet. Add the first one above.'}
          </div>
        ) : (
          <div className="req-list">
            {visible.map((req) => (
              <div
                className={`list-item req-row${
                  req.status === 'done' ? ' req-done' : ''
                }`}
                key={req.id}
              >
                <div className="req-main">
                  <span className="req-title">{req.title}</span>
                  {req.detail ? (
                    <span className="req-detail">{req.detail}</span>
                  ) : null}
                  {req.req_type ? (
                    <span className="req-type">{req.req_type}</span>
                  ) : null}
                  <span className="req-by">
                    by {req.submitted_by || 'Someone'}
                    {req.created_at ? ` · ${shortDate(dateOnly(req.created_at))}` : ''}
                  </span>
                  {Array.isArray(req.files) && req.files.length ? (
                    <div className="req-files">
                      {req.files.map((f, i) =>
                        f && f.url ? (
                          <a
                            key={`${f.url}-${i}`}
                            className="req-file"
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {f.name || 'File'}
                          </a>
                        ) : null
                      )}
                    </div>
                  ) : null}
                  <AttachFile req={req} onAttach={attachToExisting} />
                </div>
                <div className="req-right">
                  <span className={`chip req-prio prio-${req.priority || 'medium'}`}>
                    {PRIORITY_LABEL[req.priority] || 'Med'}
                  </span>
                  <button
                    type="button"
                    className={`req-status req-status-${req.status}`}
                    onClick={() => advanceStatus(req)}
                    aria-label={`Status ${
                      STATUS_LABEL[req.status] || req.status
                    }, tap to advance`}
                  >
                    {STATUS_LABEL[req.status] || req.status}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost req-edit"
                    onClick={() => setEditing(req)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger req-del"
                    onClick={() => handleDelete(req)}
                  >
                    Delete
                  </button>
                </div>
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

/* ---------------- Attach-file control (per existing request) ---------------- */

// A small "Attach file" control that uploads and appends to a request's files.
// Uses a hidden file input driven by a label so the tap target stays on-theme.
function AttachFile({ req, onAttach }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function onPick(e) {
    const files = e.target.files;
    if (!files || !files.length) return;
    setBusy(true);
    await onAttach(req, files);
    setBusy(false);
    // Reset so picking the same file again re-fires onChange.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="req-attach">
      <button
        type="button"
        className="req-attach-btn"
        disabled={busy}
        onClick={() => inputRef.current && inputRef.current.click()}
      >
        {busy ? 'Uploading…' : 'Attach file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="req-attach-input"
        onChange={onPick}
      />
    </div>
  );
}

/* ---------------- Request form ---------------- */

function RequestForm({ editing, onSaved, onCancelEdit, onError }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [submittedBy, setSubmittedBy] = useState(PEOPLE[0].value);
  const [priority, setPriority] = useState('medium');
  const [reqType, setReqType] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const isEdit = !!editing;

  // Populate the form when an existing request is selected for editing.
  useEffect(() => {
    if (editing) {
      setTitle(editing.title || '');
      setDetail(editing.detail || '');
      setSubmittedBy(editing.submitted_by || PEOPLE[0].value);
      setPriority(editing.priority || 'medium');
      setReqType(editing.req_type || '');
      setError('');
    }
  }, [editing]);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      detail: detail.trim() ? detail.trim() : null,
      submitted_by: submittedBy,
      priority,
      req_type: reqType.trim() ? reqType.trim() : null,
    };

    if (isEdit) {
      const res = await supabase
        .from('requests')
        .update(payload)
        .eq('id', editing.id);
      setSaving(false);
      if (res.error) {
        setError(res.error.message || 'Failed to save request.');
        return;
      }
      if (onError) onError('');
      onSaved();
      return;
    }

    // New request: insert and get the id back so we can upload attachments.
    const { data: inserted, error: insertError } = await supabase
      .from('requests')
      .insert({ ...payload, status: 'new' })
      .select()
      .single();

    if (insertError) {
      setSaving(false);
      setError(insertError.message || 'Failed to save request.');
      return;
    }

    // Upload any attachments, then write the {name, url} list onto the row.
    if (files.length) {
      try {
        const uploaded = await uploadRequestFiles(inserted.id, files);
        const { error: filesError } = await supabase
          .from('requests')
          .update({ files: uploaded })
          .eq('id', inserted.id);
        if (filesError) {
          setSaving(false);
          setError(filesError.message || 'Failed to save attachments.');
          return;
        }
      } catch (err) {
        setSaving(false);
        setError(err.message || 'Failed to upload attachments.');
        return;
      }
    }

    setSaving(false);
    if (onError) onError('');

    // Clear the form but keep the submitted_by + priority selections sticky.
    setTitle('');
    setDetail('');
    setReqType('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onSaved();
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">{isEdit ? 'Edit request' : 'New request'}</div>

      {!isEdit ? (
        <p className="req-intro muted">
          Ask for app changes and features. Add anything you want built - Jack
          sends these to get done.
        </p>
      ) : null}

      <div className="field">
        <label className="label">Title</label>
        <input
          type="text"
          className="input"
          value={title}
          placeholder="What do you want?"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Detail</label>
        <textarea
          className="textarea"
          value={detail}
          placeholder="What should it do?"
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Priority</label>
        <div className="seg">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              className={priority === p.value ? 'on' : ''}
              onClick={() => setPriority(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label">Type</label>
        <input
          type="text"
          className="input"
          value={reqType}
          list="req-types"
          placeholder="Feature, Bug, Idea, Chore (optional)"
          autoComplete="off"
          onChange={(e) => setReqType(e.target.value)}
        />
      </div>

      {!isEdit ? (
        <div className="field">
          <label className="label">Attach files</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="req-file-input"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          {files.length ? (
            <div className="req-file-names muted">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="req-file-name">
                  {f.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="req-file-hint muted">
              Optional - 3D models, references, anything to keep with this
              request.
            </span>
          )}
        </div>
      ) : null}

      <div className="field">
        <label className="label">Submitted by</label>
        <div className="seg">
          {PEOPLE.map((p) => (
            <button
              key={p.value}
              type="button"
              className={submittedBy === p.value ? 'on' : ''}
              onClick={() => setSubmittedBy(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="form-actions">
        {isEdit ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancelEdit}
            disabled={saving}
          >
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving
            ? files.length && !isEdit
              ? 'Uploading…'
              : 'Saving…'
            : isEdit
            ? 'Save changes'
            : 'Add request'}
        </button>
      </div>

      <datalist id="req-types">
        {REQ_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </form>
  );
}
