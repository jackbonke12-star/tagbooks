'use client';

import './inventory.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { itemLabel, shortDate, localToday } from '../../lib/catalog';
import {
  MATERIAL_KINDS,
  kindLabel,
  defaultUnitForKind,
  adjustMaterial,
} from '../../lib/inventory';
import TabTip from '../../components/TabTip';

// Sections shown in this order. Filament is handled by its own richer card.
const NON_FILAMENT_KINDS = ['review_sticker', 'nfc_tag', 'adhesive'];

// Best-effort match of an incoming order (an expense) to a material kind, so
// "Mark received" can fold the quantity into the right stock bucket.
function kindForOrder(order) {
  const hay = `${order.inv_item || ''}`.toLowerCase();
  if (hay.includes('review') || hay.includes('sticker')) return 'review_sticker';
  if (hay.includes('nfc') || hay.includes('tag')) return 'nfc_tag';
  if (hay.includes('adhesive') || hay.includes('glue')) return 'adhesive';
  if (hay.includes('filament') || hay.includes('pla') || hay.includes('petg'))
    return 'filament';
  return null;
}

export default function InventoryPage() {
  const [materials, setMaterials] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [matRes, incomingRes] = await Promise.all([
      supabase
        .from('inventory_materials')
        .select('*')
        .order('created_at', { ascending: true }),
      // Expenses flagged as stock orders that haven't been received yet.
      supabase
        .from('expenses')
        .select('*')
        .not('inv_item', 'is', null)
        .eq('received', false)
        .order('arrival_date', { ascending: true, nullsFirst: false }),
    ]);
    const err = matRes.error || incomingRes.error;
    if (err) {
      setLoadError(err.message || 'Failed to load inventory.');
      setLoading(false);
      return;
    }
    setMaterials(matRes.data || []);
    setIncoming(incomingRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when materials, movements, or expenses change.
  useRealtime(['inventory_materials', 'stock_movements', 'expenses'], load);

  // Adjust a material by +/- delta, clamped at 0, logging a stock_movement.
  const adjust = useCallback(
    async (material, delta) => {
      const current = Number(material.qty || 0);
      const next = Math.max(0, current + delta);
      if (next === current) return;
      // Optimistic update.
      setMaterials((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, qty: next } : m))
      );
      const ok = await adjustMaterial(supabase, material, delta, 'manual', null);
      if (!ok) {
        setLoadError('Failed to update quantity.');
        load();
      }
    },
    [load]
  );

  // Set a material to an exact qty (from the filament grams field, etc).
  const setQty = useCallback(
    async (material, value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return;
      const next = Math.max(0, parsed);
      const current = Number(material.qty || 0);
      if (next === current) return;
      setMaterials((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, qty: next } : m))
      );
      const ok = await adjustMaterial(
        supabase,
        material,
        next - current,
        'manual',
        null
      );
      if (!ok) {
        setLoadError('Failed to update quantity.');
        load();
      }
    },
    [load]
  );

  const deleteMaterial = useCallback(
    async (material) => {
      if (!window.confirm(`Delete "${material.name}"? This cannot be undone.`))
        return;
      const { error } = await supabase
        .from('inventory_materials')
        .delete()
        .eq('id', material.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete material.');
        return;
      }
      load();
    },
    [load]
  );

  // Receive an incoming order: best-effort fold its quantity into the matching
  // material's qty (and log a movement); if no clean match, fall back to
  // creating a material row so nothing is lost. Then mark the expense received.
  const receiveOrder = useCallback(
    async (order) => {
      const qty = Number(order.inv_qty || 0);
      const kind = kindForOrder(order);
      const nameLc = `${order.inv_item || ''}`.toLowerCase();
      // Prefer an exact-ish name match within the guessed kind; else any of kind.
      let match = null;
      if (kind) {
        const ofKind = materials.filter((m) => m.kind === kind);
        match =
          ofKind.find((m) => `${m.name}`.toLowerCase() === nameLc) ||
          ofKind[0] ||
          null;
      }
      if (match) {
        const ok = await adjustMaterial(
          supabase,
          match,
          qty,
          'received',
          order.id
        );
        if (!ok) {
          setLoadError('Failed to add to stock.');
          return;
        }
      } else {
        // No material to fold into: create one so the order still lands in stock.
        const { error: insErr } = await supabase
          .from('inventory_materials')
          .insert({
            kind: kind || 'other',
            name: itemLabel(order.inv_item),
            qty,
            unit: defaultUnitForKind(kind || 'other'),
          });
        if (insErr) {
          setLoadError(insErr.message || 'Failed to add to stock.');
          return;
        }
      }
      const { error: expErr } = await supabase
        .from('expenses')
        .update({ received: true, received_date: localToday() })
        .eq('id', order.id);
      if (expErr) {
        setLoadError(expErr.message || 'Failed to mark received.');
        return;
      }
      load();
    },
    [materials, load]
  );

  // Rename an incoming order (updates the expense's inv_item).
  const renameOrder = useCallback(
    async (order) => {
      const current = order.inv_item || '';
      const next = window.prompt('Rename this incoming order', current);
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === current) return;
      // Optimistic.
      setIncoming((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, inv_item: trimmed } : o))
      );
      const { error } = await supabase
        .from('expenses')
        .update({ inv_item: trimmed })
        .eq('id', order.id);
      if (error) {
        setLoadError(error.message || 'Failed to rename order.');
        load();
      }
    },
    [load]
  );

  const byKind = useMemo(() => {
    const map = {};
    for (const k of MATERIAL_KINDS) map[k.value] = [];
    for (const m of materials) {
      if (!map[m.kind]) map[m.kind] = [];
      map[m.kind].push(m);
    }
    return map;
  }, [materials]);

  const filament = byKind.filament || [];

  // Low-stock summary: any material at or below its reorder_at threshold.
  const lowItems = useMemo(
    () =>
      materials.filter(
        (m) =>
          m.reorder_at != null &&
          Number(m.qty || 0) <= Number(m.reorder_at || 0)
      ),
    [materials]
  );
  const showWarning = !loading && lowItems.length > 0;

  return (
    <div className="inventory">
      <div className="page-head">
        <h1 className="page-title">Inventory</h1>
        <p className="page-title-sub">
          Track materials on hand, filament rolls, and incoming orders.
        </p>
      </div>

      <TabTip id="inventory">
        Stock is grouped by material. Filament rolls track grams remaining.
        Orders from the Money tab show under &quot;Incoming orders&quot; — tap
        &quot;Mark received&quot; when one arrives to add it to stock.
      </TabTip>

      {loadError ? <div className="form-error">{loadError}</div> : null}

      {showWarning ? (
        <div className="stock-warning">
          Running low:{' '}
          {lowItems.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ', ' : ''}
              {m.reorder_url ? (
                <a
                  className="stock-warning-link"
                  href={m.reorder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m.name}
                </a>
              ) : (
                m.name
              )}
            </span>
          ))}
          . Tap a name to reorder.
        </div>
      ) : null}

      {loading ? (
        <div className="card">
          <div className="muted load-line">Loading…</div>
        </div>
      ) : (
        <>
          {/* Non-filament material sections. */}
          {NON_FILAMENT_KINDS.map((kind) => (
            <MaterialSection
              key={kind}
              kind={kind}
              title={kindLabel(kind)}
              rows={byKind[kind] || []}
              onAdjust={adjust}
              onSet={setQty}
              onDelete={deleteMaterial}
              onSaved={load}
              onError={setLoadError}
            />
          ))}

          {/* Filament — its own richer section (color, plastic, grams + % bar). */}
          <FilamentSection
            rows={filament}
            onAdjust={adjust}
            onSet={setQty}
            onDelete={deleteMaterial}
            onSaved={load}
            onError={setLoadError}
          />
        </>
      )}

      {/* Incoming stock orders (from expenses flagged as orders) */}
      {incoming.length > 0 ? (
        <div className="card">
          <div className="card-label">Incoming orders</div>
          <p className="inv-hint muted">
            Stock you ordered from the Money tab. Tap “Mark received” when it
            arrives to add the quantity to your stock, or “Edit name” to rename.
          </p>
          <div className="inv-incoming">
            {incoming.map((order) => {
              const arr = order.arrival_date;
              const overdue = arr && arr < localToday();
              const dueToday = arr && arr === localToday();
              return (
                <div className="inv-in-row" key={order.id}>
                  <div className="inv-in-main">
                    <span className="inv-in-name">
                      {itemLabel(order.inv_item)}
                    </span>
                    <span className="inv-in-sub">
                      +{Number(order.inv_qty || 0)}
                      {order.vendor ? ` · ${order.vendor}` : ''}
                    </span>
                  </div>
                  <div className="inv-in-right">
                    <span
                      className={
                        'inv-in-eta ' +
                        (overdue ? 'red' : dueToday ? 'green' : 'muted')
                      }
                    >
                      {arr
                        ? overdue
                          ? `Due ${shortDate(arr)}`
                          : dueToday
                          ? 'Arrives today'
                          : `Arrives ${shortDate(arr)}`
                        : 'No date'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost inv-in-edit"
                      onClick={() => renameOrder(order)}
                    >
                      Edit name
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary inv-in-recv"
                      onClick={() => receiveOrder(order)}
                    >
                      Mark received
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Material section (non-filament) ---------------- */

function MaterialSection({
  kind,
  title,
  rows,
  onAdjust,
  onSet,
  onDelete,
  onSaved,
  onError,
}) {
  return (
    <div className="card">
      <div className="card-label">{title}</div>
      {rows.length === 0 ? (
        <p className="inv-hint muted">
          No {title.toLowerCase()} yet. Add one below.
        </p>
      ) : (
        <div className="inv-list">
          {rows.map((row) => (
            <MaterialRow
              key={row.id}
              row={row}
              onAdjust={onAdjust}
              onSet={onSet}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
      <AddMaterialForm
        kind={kind}
        onSaved={onSaved}
        onError={onError}
      />
    </div>
  );
}

// One non-filament material: name + reorder link, low-stock highlight, editable
// qty with − / + steppers.
function MaterialRow({ row, onAdjust, onSet, onDelete }) {
  const committed = Number(row.qty || 0);
  const [draft, setDraft] = useState(String(committed));
  const focusedRef = useRef(false);
  const low =
    row.reorder_at != null && committed <= Number(row.reorder_at || 0);

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(committed));
  }, [committed]);

  function commit() {
    const trimmed = draft.trim();
    const parsed = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(parsed)) {
      setDraft(String(committed));
      return;
    }
    const next = Math.max(0, parsed);
    setDraft(String(next));
    onSet(row, next);
  }

  return (
    <div className={`inv-row${low ? ' inv-low' : ''}`}>
      <div className="inv-main">
        <span className="inv-name">
          {row.name}
          {low ? <span className="inv-low-tag">LOW</span> : null}
        </span>
        <span className="inv-sub">
          {committed} {row.unit || 'pcs'}
          {row.reorder_url ? (
            <a
              className="inv-reorder-inline"
              href={row.reorder_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Reorder
            </a>
          ) : null}
          <button
            type="button"
            className="inv-del-link"
            onClick={() => onDelete(row)}
          >
            Delete
          </button>
        </span>
      </div>
      <div className="inv-controls">
        <button
          type="button"
          className="btn btn-ghost inv-step"
          onClick={() => onAdjust(row, -1)}
          aria-label={`Decrease ${row.name}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          className="inv-qty"
          value={draft}
          aria-label={`${row.name} quantity`}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            focusedRef.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost inv-step"
          onClick={() => onAdjust(row, 1)}
          aria-label={`Increase ${row.name}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ---------------- Filament section ---------------- */

function FilamentSection({ rows, onAdjust, onSet, onDelete, onSaved, onError }) {
  return (
    <div className="card">
      <div className="card-label">Filament</div>
      <div className="fil-head">
        <p className="inv-hint muted">
          Each roll tracks grams remaining. Bambu tray is stored for a future
          sync — live levels need Bambu cloud credentials.
        </p>
        <button
          type="button"
          className="btn btn-ghost fil-sync"
          disabled
          title="Needs Bambu cloud credentials"
        >
          Sync from Bambu
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="inv-hint muted">No rolls yet. Add one below.</p>
      ) : (
        <div className="fil-list">
          {rows.map((row) => (
            <FilamentRow
              key={row.id}
              row={row}
              onAdjust={onAdjust}
              onSet={onSet}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
      <AddFilamentForm onSaved={onSaved} onError={onError} />
    </div>
  );
}

function FilamentRow({ row, onAdjust, onSet, onDelete }) {
  const grams = Number(row.qty || 0);
  const full = Number(row.roll_start_g || 0);
  const pct = full > 0 ? Math.max(0, Math.min(100, (grams / full) * 100)) : 0;
  const [draft, setDraft] = useState(String(grams));
  const focusedRef = useRef(false);
  const low = row.reorder_at != null && grams <= Number(row.reorder_at || 0);
  // Swatch color: stored in notes as a hex (#rrggbb) if present, else neutral.
  const swatch =
    row.notes && /^#[0-9a-fA-F]{3,8}$/.test(row.notes.trim())
      ? row.notes.trim()
      : '#b9a985';

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(grams));
  }, [grams]);

  function commit() {
    const trimmed = draft.trim();
    const parsed = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(parsed)) {
      setDraft(String(grams));
      return;
    }
    onSet(row, Math.max(0, parsed));
  }

  return (
    <div className={`fil-row${low ? ' inv-low' : ''}`}>
      <div className="fil-top">
        <span
          className="fil-swatch"
          style={{ background: swatch }}
          aria-hidden="true"
        />
        <div className="fil-id">
          <span className="fil-name">
            {row.name}
            {low ? <span className="inv-low-tag">LOW</span> : null}
          </span>
          <span className="fil-meta">
            {row.plastic_type ? row.plastic_type : 'Filament'}
            {row.color ? ` · ${row.color}` : ''}
            {row.bambu_tray ? ` · Tray ${row.bambu_tray}` : ''}
          </span>
        </div>
        <button
          type="button"
          className="inv-del-link fil-del"
          onClick={() => onDelete(row)}
        >
          Delete
        </button>
      </div>

      <div className="fil-bar" aria-hidden="true">
        <div className="fil-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="fil-bottom">
        <span className="fil-grams">
          {full > 0 ? `${grams} / ${full} g · ${Math.round(pct)}%` : `${grams} g`}
        </span>
        <div className="inv-controls">
          <button
            type="button"
            className="btn btn-ghost inv-step"
            onClick={() => onAdjust(row, -10)}
            aria-label={`Subtract 10g from ${row.name}`}
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            className="inv-qty"
            value={draft}
            aria-label={`${row.name} grams remaining`}
            onFocus={() => {
              focusedRef.current = true;
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              focusedRef.current = false;
              commit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-ghost inv-step"
            onClick={() => onAdjust(row, 10)}
            aria-label={`Add 10g to ${row.name}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Add material form (non-filament) ---------------- */

function AddMaterialForm({ kind, onSaved, onError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [reorderAt, setReorderAt] = useState('');
  const [reorderUrl, setReorderUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const unit = defaultUnitForKind(kind);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    const payload = {
      kind,
      name: name.trim(),
      qty: qty === '' ? 0 : Math.max(0, Number(qty) || 0),
      unit,
      reorder_at: reorderAt === '' ? null : Number(reorderAt),
      reorder_url: reorderUrl.trim() ? reorderUrl.trim() : null,
    };
    const { error: err } = await supabase
      .from('inventory_materials')
      .insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to add material.');
      return;
    }
    setName('');
    setQty('');
    setReorderAt('');
    setReorderUrl('');
    setOpen(false);
    if (onError) onError('');
    onSaved();
  }

  if (!open) {
    return (
      <div className="inv-add-toggle">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(true)}
        >
          + Add material
        </button>
      </div>
    );
  }

  return (
    <form className="inv-form" onSubmit={submit}>
      <div className="field">
        <label className="label">Name</label>
        <input
          type="text"
          className="input"
          value={name}
          placeholder={`e.g. ${kindLabel(kind)}`}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid2">
        <div className="field">
          <label className="label">Quantity ({unit})</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Low at ({unit})</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="input"
            value={reorderAt}
            placeholder="Optional"
            onChange={(e) => setReorderAt(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="label">Reorder link</label>
        <input
          type="url"
          className="input"
          value={reorderUrl}
          placeholder="Optional https://…"
          onChange={(e) => setReorderUrl(e.target.value)}
        />
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add material'}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Add filament roll form ---------------- */

function AddFilamentForm({ onSaved, onError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [colorHex, setColorHex] = useState('#000000');
  const [plastic, setPlastic] = useState('PLA');
  const [startG, setStartG] = useState('1000');
  const [grams, setGrams] = useState('');
  const [tray, setTray] = useState('');
  const [reorderAt, setReorderAt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    const start = startG === '' ? null : Math.max(0, Number(startG) || 0);
    const remaining =
      grams === '' ? (start != null ? start : 0) : Math.max(0, Number(grams) || 0);
    const payload = {
      kind: 'filament',
      name: name.trim(),
      color: color.trim() ? color.trim() : null,
      plastic_type: plastic.trim() ? plastic.trim() : null,
      qty: remaining,
      unit: 'g',
      roll_start_g: start,
      bambu_tray: tray.trim() ? tray.trim() : null,
      reorder_at: reorderAt === '' ? null : Number(reorderAt),
      // Store the swatch hex in notes so the row can render a color chip.
      notes: colorHex || null,
    };
    const { error: err } = await supabase
      .from('inventory_materials')
      .insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to add roll.');
      return;
    }
    setName('');
    setColor('');
    setColorHex('#000000');
    setPlastic('PLA');
    setStartG('1000');
    setGrams('');
    setTray('');
    setReorderAt('');
    setOpen(false);
    if (onError) onError('');
    onSaved();
  }

  if (!open) {
    return (
      <div className="inv-add-toggle">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(true)}
        >
          + Add filament roll
        </button>
      </div>
    );
  }

  return (
    <form className="inv-form" onSubmit={submit}>
      <div className="field">
        <label className="label">Roll name</label>
        <input
          type="text"
          className="input"
          value={name}
          placeholder="e.g. PLA Basic Black"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid2">
        <div className="field">
          <label className="label">Plastic type</label>
          <input
            type="text"
            className="input"
            value={plastic}
            placeholder="PLA / PETG"
            onChange={(e) => setPlastic(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Color name</label>
          <input
            type="text"
            className="input"
            value={color}
            placeholder="e.g. Black"
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label className="label">Swatch color</label>
          <input
            type="color"
            className="input inv-color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Bambu tray</label>
          <input
            type="text"
            className="input"
            value={tray}
            placeholder="e.g. AMS 1"
            onChange={(e) => setTray(e.target.value)}
          />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label className="label">Full roll (g)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="input"
            value={startG}
            onChange={(e) => setStartG(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Remaining (g)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="input"
            value={grams}
            placeholder="Defaults to full"
            onChange={(e) => setGrams(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label className="label">Low at (g)</label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          className="input"
          value={reorderAt}
          placeholder="Optional"
          onChange={(e) => setReorderAt(e.target.value)}
        />
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add roll'}
        </button>
      </div>
    </form>
  );
}
