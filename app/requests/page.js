'use client';

import './requests.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');

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

  // Counts per status for the filter labels.
  const counts = useMemo(() => {
    const c = { all: requests.length, new: 0, building: 0, done: 0 };
    for (const r of requests) {
      if (c[r.status] !== undefined) c[r.status] += 1;
    }
    return c;
  }, [requests]);

  const visible = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  return (
    <div className="requests">
      <RequestForm onSaved={load} onError={setLoadError} />

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
          <div className="muted">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="muted req-empty">
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
                  <span className="req-by">
                    by {req.submitted_by || 'Someone'}
                    {req.created_at ? ` · ${shortDate(dateOnly(req.created_at))}` : ''}
                  </span>
                </div>
                <div className="req-right">
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

/* ---------------- Request form ---------------- */

function RequestForm({ onSaved, onError }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [submittedBy, setSubmittedBy] = useState(PEOPLE[0].value);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      status: 'new',
    };
    const { error: err } = await supabase.from('requests').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to add request.');
      return;
    }
    // Clear the form but keep the submitted_by selection sticky.
    setTitle('');
    setDetail('');
    if (onError) onError('');
    onSaved();
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">New request</div>

      <p className="req-intro muted">
        Ask for app changes and features. Add anything you want built - Jack
        sends these to get done.
      </p>

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
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add request'}
        </button>
      </div>
    </form>
  );
}
