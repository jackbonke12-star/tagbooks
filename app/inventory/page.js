'use client';

import './inventory.css';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { ITEMS, itemLabel, shortDate } from '../../lib/catalog';

const STATUS_LABEL = { waiting: 'Waiting', printing: 'Printing', done: 'Done' };
const NEXT_STATUS = { waiting: 'printing', printing: 'done', done: 'done' };

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [invRes, jobsRes] = await Promise.all([
      supabase.from('inventory').select('*').order('item', { ascending: true }),
      supabase
        .from('print_queue')
        .select('*')
        .order('created_at', { ascending: true }),
    ]);
    const err = invRes.error || jobsRes.error;
    if (err) {
      setLoadError(err.message || 'Failed to load inventory.');
      setLoading(false);
      return;
    }
    setInventory(invRes.data || []);
    setJobs(jobsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when inventory or print jobs change on any device.
  useRealtime(['inventory', 'print_queue'], load);

  const qtyOf = useCallback(
    (item) => {
      const row = inventory.find((r) => r.item === item);
      return row ? Number(row.quantity || 0) : 0;
    },
    [inventory]
  );

  const adjust = useCallback(
    async (row, delta) => {
      const next = Math.max(0, Number(row.quantity || 0) + delta);
      if (next === Number(row.quantity || 0)) return;
      // Optimistic update.
      setInventory((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, quantity: next } : r))
      );
      const { error } = await supabase
        .from('inventory')
        .update({ quantity: next })
        .eq('id', row.id);
      if (error) {
        setLoadError(error.message || 'Failed to update quantity.');
        load();
      }
    },
    [load]
  );

  const advanceStatus = useCallback(
    async (job) => {
      const next = NEXT_STATUS[job.status] || 'waiting';
      if (next === job.status) return;
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: next } : j))
      );
      const { error } = await supabase
        .from('print_queue')
        .update({ status: next })
        .eq('id', job.id);
      if (error) {
        setLoadError(error.message || 'Failed to update job.');
        load();
      }
    },
    [load]
  );

  const deleteJob = useCallback(
    async (job) => {
      if (!window.confirm('Delete this print job? This cannot be undone.'))
        return;
      const { error } = await supabase
        .from('print_queue')
        .delete()
        .eq('id', job.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete job.');
        return;
      }
      load();
    },
    [load]
  );

  // Low-stock warning: cards < 20 OR filament_rolls < 1.
  const lowCards = qtyOf('cards') < 20;
  const lowFilament = qtyOf('filament_rolls') < 1;
  const lowParts = [];
  if (lowCards) lowParts.push('cards');
  if (lowFilament) lowParts.push('filament rolls');
  const showWarning = !loading && (lowCards || lowFilament);

  // Sort jobs: active (waiting/printing) first by created order, done last.
  const sortedJobs = [...jobs].sort((a, b) => {
    const ad = a.status === 'done' ? 1 : 0;
    const bd = b.status === 'done' ? 1 : 0;
    if (ad !== bd) return ad - bd;
    const ca = a.created_at || '';
    const cb = b.created_at || '';
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  return (
    <div className="inventory">
      {loadError ? <div className="form-error">{loadError}</div> : null}

      {showWarning ? (
        <div className="stock-warning">
          Low stock: {lowParts.join(' and ')}. Reorder soon.
        </div>
      ) : null}

      {/* Inventory */}
      <div className="card">
        <div className="card-label">Inventory</div>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="inv-list">
            {ITEMS.map((it) => {
              const row = inventory.find((r) => r.item === it.value) || {
                id: it.value,
                item: it.value,
                quantity: 0,
              };
              return (
                <div className="inv-row" key={it.value}>
                  <div className="inv-main">
                    <span className="inv-name">{it.label}</span>
                  </div>
                  <div className="inv-controls">
                    <button
                      type="button"
                      className="btn btn-ghost inv-step"
                      onClick={() => adjust(row, -1)}
                      aria-label={`Decrease ${it.label}`}
                    >
                      −
                    </button>
                    <span className="big-num">{Number(row.quantity || 0)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost inv-step"
                      onClick={() => adjust(row, 1)}
                      aria-label={`Increase ${it.label}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Print queue */}
      <div className="card">
        <div className="card-label">Print queue</div>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : sortedJobs.length === 0 ? (
          <div className="muted">No print jobs.</div>
        ) : (
          <div className="pq-list">
            {sortedJobs.map((job) => (
              <div
                className={`pq-row${job.status === 'done' ? ' pq-done' : ''}`}
                key={job.id}
              >
                <div className="pq-main">
                  <span className="pq-title">{itemLabel(job.item)}</span>
                  <span className="pq-sub">
                    {job.client ? job.client : 'No client'}
                    {job.due_date ? ` · due ${shortDate(job.due_date)}` : ''}
                  </span>
                </div>
                <div className="pq-right">
                  <button
                    type="button"
                    className={`pq-status pq-status-${job.status}`}
                    onClick={() => advanceStatus(job)}
                  >
                    {STATUS_LABEL[job.status] || job.status}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger pq-del"
                    onClick={() => deleteJob(job)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AddJobForm onSaved={load} onError={setLoadError} />
      </div>
    </div>
  );
}

/* ---------------- Add print job form ---------------- */

function AddJobForm({ onSaved, onError }) {
  const [client, setClient] = useState('');
  const [item, setItem] = useState(ITEMS[0].value);
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!item.trim()) {
      setError('Item is required.');
      return;
    }
    setSaving(true);
    const payload = {
      client: client.trim() ? client.trim() : null,
      item: item.trim(),
      status: 'waiting',
      due_date: dueDate || null,
    };
    const { error: err } = await supabase.from('print_queue').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to add print job.');
      return;
    }
    setClient('');
    setItem(ITEMS[0].value);
    setDueDate('');
    if (onError) onError('');
    onSaved();
  }

  return (
    <form className="pq-form" onSubmit={submit}>
      <div className="card-label">Add print job</div>
      <div className="grid2">
        <div className="field">
          <label className="label">Client</label>
          <input
            type="text"
            className="input"
            value={client}
            placeholder="Optional"
            onChange={(e) => setClient(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Item</label>
          <select
            className="select"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          >
            {ITEMS.map((it) => (
              <option key={it.value} value={it.value}>
                {it.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label">Due date</label>
        <input
          type="date"
          className="input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add print job'}
        </button>
      </div>
    </form>
  );
}
