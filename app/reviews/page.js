'use client';

import './reviews.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { stageLabel, localToday } from '../../lib/catalog';

// Read the shared PIN from localStorage at call time (SSR-safe). Sent as the
// x-app-pin header so the /api/reviews/refresh route authorizes the request.
// Same pattern as app/printer/page.js.
function pinHeaders() {
  if (typeof window === 'undefined') return {};
  try {
    const pin = localStorage.getItem('tagbooks-pin');
    return pin ? { 'x-app-pin': pin } : {};
  } catch {
    return {};
  }
}

// Format a captured_at (timestamptz) or a stored date into "Jul 22" using the
// LOCAL calendar parts. Never construct a UTC-midnight Date (that shifts the
// day in US Eastern evenings). Handles both "2026-07-22" and full ISO stamps.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
function fmtDate(value) {
  if (!value) return '';
  const s = String(value);
  // Take just the date portion (YYYY-MM-DD) before any 'T' so parsing the
  // parts stays local and stable regardless of the stored time zone.
  const datePart = s.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${MONTHS[m - 1]} ${d}`;
}

// Format a numeric rating like 4.7 -> "4.7". Returns '' when absent.
function fmtRating(r) {
  if (r == null) return '';
  const n = Number(r);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(1);
}

// Build the per-client view model from the raw clients + snapshots.
// - latest snapshot -> current count / rating / captured_at
// - baseline = client.baseline_reviews, else the earliest snapshot's count
// - baselineDate = client.baseline_date, else the earliest snapshot's time
// - gained = current - baseline when both are known, else null
function buildRows(clients, snapshots) {
  // Group snapshots by client for a single pass.
  const byClient = new Map();
  for (const s of snapshots || []) {
    if (!byClient.has(s.client_id)) byClient.set(s.client_id, []);
    byClient.get(s.client_id).push(s);
  }

  const rows = (clients || []).map((c) => {
    const list = byClient.get(c.id) || [];
    let latest = null;
    let earliest = null;
    for (const s of list) {
      const t = s.captured_at ? new Date(s.captured_at).getTime() : 0;
      if (latest == null || t > latest._t) latest = { ...s, _t: t };
      if (earliest == null || t < earliest._t) earliest = { ...s, _t: t };
    }

    const current = latest ? latest.review_count : null;
    const rating = latest ? latest.rating : null;
    const updatedAt = latest ? latest.captured_at : null;

    const baseline =
      c.baseline_reviews != null
        ? c.baseline_reviews
        : earliest
        ? earliest.review_count
        : null;
    const baselineDate =
      c.baseline_date != null
        ? c.baseline_date
        : earliest
        ? earliest.captured_at
        : null;

    const gained =
      current != null && baseline != null ? current - baseline : null;

    return {
      client: c,
      current,
      rating,
      updatedAt,
      baseline,
      baselineDate,
      gained,
    };
  });

  // Most gained first; rows with no gain data sink to the bottom.
  rows.sort((a, b) => {
    const av = a.gained == null ? -Infinity : a.gained;
    const bv = b.gained == null ? -Infinity : b.gained;
    return bv - av;
  });

  return rows;
}

export default function ReviewsPage() {
  const [clients, setClients] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Refresh-from-Google state.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const [clientsRes, snapsRes] = await Promise.all([
      supabase.from('clients').select('*').order('business_name', { ascending: true }),
      supabase.from('review_snapshots').select('*'),
    ]);
    if (clientsRes.error) {
      setLoadError(clientsRes.error.message || 'Failed to load clients.');
      setLoading(false);
      return;
    }
    setClients(clientsRes.data || []);
    // Snapshots are a bonus signal; if they fail we still show baselines.
    setSnapshots(snapsRes.error ? [] : snapsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when clients or snapshots change on any device.
  useRealtime(['clients', 'review_snapshots'], load);

  const rows = useMemo(
    () => buildRows(clients, snapshots),
    [clients, snapshots]
  );

  // Headline: total positive reviews driven across all clients.
  const totalGained = useMemo(
    () =>
      rows.reduce((sum, r) => sum + (r.gained != null && r.gained > 0 ? r.gained : 0), 0),
    [rows]
  );

  const hasTracked = useMemo(
    () => rows.some((r) => r.gained != null),
    [rows]
  );

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote('');
    try {
      const res = await fetch('/api/reviews/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...pinHeaders() },
        cache: 'no-store',
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        setRefreshNote(
          'Refresh failed — the server did not respond. Enter counts manually below.'
        );
      } else if (data.configured === false) {
        setRefreshNote(
          'Auto-refresh from Google isn’t set up yet — a Google server key is needed on the server. For now, enter the current counts manually below.'
        );
      } else if (data.keyRestricted) {
        setRefreshNote(
          data.note ||
            'The Google key is referer-restricted, so it can’t be used server-side yet.'
        );
      } else if (data.updated > 0) {
        setRefreshNote(
          data.updated === 1
            ? 'Updated 1 client from Google.'
            : `Updated ${data.updated} clients from Google.`
        );
        load();
      } else {
        setRefreshNote(
          'No counts came back from Google — the clients may be missing a place id in their review link. Enter counts manually below.'
        );
      }
    } catch {
      setRefreshNote(
        'Refresh failed — the server was unreachable. Enter counts manually below.'
      );
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, load]);

  return (
    <div className="reviews">
      <div className="page-head">
        <h1 className="page-title">Reviews</h1>
        <p className="page-title-sub">
          Proof of the Google reviews we’ve driven for each client — their count
          before we installed vs. now. Use it to pitch the next shop.
        </p>
      </div>

      {/* Headline: total reviews driven */}
      <div className="card reviews-headline">
        <div className="card-label">Reviews driven</div>
        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : !hasTracked ? (
          <p className="reviews-headline-empty muted">
            Nothing tracked yet. Set each client’s install number and log their
            current count below to start the tally.
          </p>
        ) : totalGained > 0 ? (
          <p className="reviews-headline-line">
            You’ve driven{' '}
            <span className="reviews-headline-num green">
              +{totalGained.toLocaleString('en-US')}
            </span>{' '}
            Google reviews.
          </p>
        ) : (
          <p className="reviews-headline-line muted">
            No net gain yet — keep logging current counts as reviews come in.
          </p>
        )}

        <div className="reviews-refresh">
          <button
            type="button"
            className="btn"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh from Google'}
          </button>
          <span className="reviews-refresh-hint muted">
            Pulls the live count for clients with a Google review link.
          </span>
        </div>
        {refreshNote ? (
          <p className="reviews-refresh-note muted">{refreshNote}</p>
        ) : null}
      </div>

      {loadError ? <div className="form-error">{loadError}</div> : null}

      {/* Per-client cards */}
      {loading ? (
        <div className="card">
          <div className="muted load-line">Loading…</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <p className="muted reviews-empty">
            No clients yet. Add clients on the Clients tab to start tracking
            their review growth.
          </p>
        </div>
      ) : (
        <div className="reviews-list">
          {rows.map((row) => (
            <ClientCard key={row.client.id} row={row} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

// One client's before -> now card, with the two always-works manual inputs.
function ClientCard({ row, onChanged }) {
  const { client, current, rating, updatedAt, baseline, baselineDate, gained } =
    row;

  return (
    <div className="card review-card">
      <div className="review-card-head">
        <span className="review-name">{client.business_name}</span>
        <span className={`review-chip chip-${client.stage}`}>
          {stageLabel(client.stage)}
        </span>
      </div>

      {/* Before -> Now with the gained badge */}
      <div className="review-track">
        <div className="review-stat">
          <span className="review-stat-label">Before</span>
          <span className="review-stat-num">
            {baseline != null ? baseline.toLocaleString('en-US') : '—'}
          </span>
        </div>
        <span className="review-arrow" aria-hidden="true">
          →
        </span>
        <div className="review-stat">
          <span className="review-stat-label">Now</span>
          <span className="review-stat-num">
            {current != null ? current.toLocaleString('en-US') : '—'}
          </span>
        </div>
        {gained != null && gained > 0 ? (
          <span className="review-gained green">
            +{gained.toLocaleString('en-US')}
          </span>
        ) : gained != null && gained < 0 ? (
          <span className="review-gained red">
            {gained.toLocaleString('en-US')}
          </span>
        ) : null}
      </div>

      {/* Rating + dates */}
      <div className="review-meta muted">
        {rating != null ? (
          <span className="review-rating">
            <span className="review-star" aria-hidden="true">
              ★
            </span>
            {fmtRating(rating)} rating
          </span>
        ) : null}
        {updatedAt ? (
          <span className="review-meta-item">updated {fmtDate(updatedAt)}</span>
        ) : null}
        {baselineDate ? (
          <span className="review-meta-item">
            since {fmtDate(baselineDate)}
          </span>
        ) : null}
        {!client.google_review_url ? (
          <span className="review-meta-item">manual only</span>
        ) : null}
      </div>

      <ClientEditors client={client} onChanged={onChanged} />
    </div>
  );
}

// The two persist-to-Supabase inputs: the install baseline (updates the client
// row) and the current count (inserts a manual snapshot — the path that always
// works, even without a Google key).
function ClientEditors({ client, onChanged }) {
  const [baselineInput, setBaselineInput] = useState(
    client.baseline_reviews != null ? String(client.baseline_reviews) : ''
  );
  const [currentInput, setCurrentInput] = useState('');
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');

  // Keep the baseline field in sync if the underlying client changes (realtime
  // reload) — but don't clobber an in-progress edit.
  useEffect(() => {
    setBaselineInput(
      client.baseline_reviews != null ? String(client.baseline_reviews) : ''
    );
    // Only re-sync when the stored value actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.baseline_reviews]);

  async function saveBaseline() {
    const raw = baselineInput.trim();
    const n = raw === '' ? null : Number(raw);
    if (raw !== '' && (!Number.isFinite(n) || n < 0)) {
      setError('Enter a whole number for the install count.');
      return;
    }
    setSavingBaseline(true);
    setError('');
    const payload = { baseline_reviews: n };
    // Stamp a baseline date the first time it's set, so "since" has an anchor.
    if (n != null && !client.baseline_date) {
      payload.baseline_date = localToday();
    }
    const { error: upErr } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', client.id);
    setSavingBaseline(false);
    if (upErr) {
      setError(upErr.message || 'Could not save the install number.');
      return;
    }
    onChanged();
  }

  async function logCurrent() {
    const raw = currentInput.trim();
    if (raw === '') {
      setError('Enter the current review count to log it.');
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a whole number for the current count.');
      return;
    }
    setLogging(true);
    setError('');
    const { error: insErr } = await supabase.from('review_snapshots').insert({
      client_id: client.id,
      review_count: n,
      source: 'manual',
    });
    setLogging(false);
    if (insErr) {
      setError(insErr.message || 'Could not log the current count.');
      return;
    }
    setCurrentInput('');
    onChanged();
  }

  return (
    <div className="review-editors">
      <div className="review-editor">
        <label className="review-editor-label">Install # (before)</label>
        <div className="review-editor-row">
          <input
            type="number"
            className="input review-num"
            value={baselineInput}
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="—"
            onChange={(e) => setBaselineInput(e.target.value)}
            onBlur={saveBaseline}
          />
          <button
            type="button"
            className="btn btn-ghost review-log"
            onClick={saveBaseline}
            disabled={savingBaseline}
          >
            {savingBaseline ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="review-editor">
        <label className="review-editor-label">Current #</label>
        <div className="review-editor-row">
          <input
            type="number"
            className="input review-num"
            value={currentInput}
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="count now"
            onChange={(e) => setCurrentInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary review-log"
            onClick={logCurrent}
            disabled={logging}
          >
            {logging ? 'Logging…' : 'Log'}
          </button>
        </div>
      </div>

      {error ? <div className="form-error review-editor-error">{error}</div> : null}
    </div>
  );
}
