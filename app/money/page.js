'use client';

import './money.css';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import {
  PRODUCTS,
  CATEGORIES,
  productByValue,
  productLabel,
  categoryLabel,
  money,
  localToday,
  monthRange,
  isKit,
  needsLogoStand,
} from '../../lib/catalog';
import MonthSwitcher from '../../components/MonthSwitcher';
import EntryRow from '../../components/EntryRow';

export default function MoneyPage() {
  // Selected LOCAL month.
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());

  // Which add form is showing.
  const [mode, setMode] = useState('sale'); // 'sale' | 'expense'

  // Data.
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const formTopRef = useRef(null);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { first, last } = monthRange(year, monthIndex);
    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*')
        .gte('date', first)
        .lte('date', last)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('expenses')
        .select('*')
        .gte('date', first)
        .lte('date', last)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    const err = salesRes.error || expensesRes.error;
    if (err) {
      setLoadError(err.message || 'Failed to load entries.');
      setLoading(false);
      return;
    }
    setSales(salesRes.data || []);
    setExpenses(expensesRes.data || []);
    setLoading(false);
  }, [year, monthIndex]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  // Live updates: reload the month when sales or expenses change on any device.
  useRealtime(['sales', 'expenses'], loadMonth);

  // Edit target: null, or { kind, ...row }.
  const [editing, setEditing] = useState(null);

  const startEdit = useCallback((entry) => {
    setMode(entry.kind);
    setEditing(entry);
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const handleDelete = useCallback(
    async (entry) => {
      const table = entry.kind === 'sale' ? 'sales' : 'expenses';
      const desc =
        entry.kind === 'sale'
          ? entry.client_name || 'this sale'
          : 'this expense';
      if (!window.confirm(`Delete ${desc}? This cannot be undone.`)) return;
      const { error } = await supabase.from(table).delete().eq('id', entry.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete entry.');
        return;
      }
      if (editing && editing.id === entry.id) setEditing(null);
      loadMonth();
    },
    [editing, loadMonth]
  );

  // Merged rows for the table (newest first already via query order; merge + resort).
  const rows = useMemo(() => {
    const merged = [
      ...sales.map((s) => ({ ...s, kind: 'sale' })),
      ...expenses.map((e) => ({ ...e, kind: 'expense' })),
    ];
    merged.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const ca = a.created_at || '';
      const cb = b.created_at || '';
      if (ca === cb) return 0;
      return ca < cb ? 1 : -1;
    });
    return merged;
  }, [sales, expenses]);

  const salesTotal = useMemo(
    () => sales.reduce((a, s) => a + Number(s.amount || 0), 0),
    [sales]
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((a, e) => a + Number(e.amount || 0), 0),
    [expenses]
  );

  function onMonthChange(y, m) {
    setEditing(null);
    setYear(y);
    setMonthIndex(m);
  }

  function onModeChange(next) {
    // Switching the segmented form abandons an in-progress edit of the other kind.
    if (editing && editing.kind !== next) setEditing(null);
    setMode(next);
  }

  // CSV export. `scope` is 'month' or 'year'. Queries the period straight from
  // supabase (not loaded state) so the year export covers all 12 months.
  const [exporting, setExporting] = useState(false);
  const doExport = useCallback(
    async (scope) => {
      setExporting(true);
      setLoadError('');
      let first;
      let last;
      let salesName;
      let expensesName;
      if (scope === 'year') {
        first = monthRange(year, 0).first;
        last = monthRange(year, 11).last;
        salesName = `tagbooks-sales-${year}.csv`;
        expensesName = `tagbooks-expenses-${year}.csv`;
      } else {
        const r = monthRange(year, monthIndex);
        first = r.first;
        last = r.last;
        const mm = String(monthIndex + 1).padStart(2, '0');
        salesName = `tagbooks-sales-${year}-${mm}.csv`;
        expensesName = `tagbooks-expenses-${year}-${mm}.csv`;
      }

      const [salesRes, expensesRes] = await Promise.all([
        supabase
          .from('sales')
          .select('*')
          .gte('date', first)
          .lte('date', last)
          .order('date', { ascending: true }),
        supabase
          .from('expenses')
          .select('*')
          .gte('date', first)
          .lte('date', last)
          .order('date', { ascending: true }),
      ]);

      setExporting(false);
      const err = salesRes.error || expensesRes.error;
      if (err) {
        setLoadError(err.message || 'Failed to export.');
        return;
      }

      const salesCsv = toCsv(
        ['date', 'client_name', 'product', 'amount', 'type', 'closed_by', 'notes'],
        (salesRes.data || []).map((s) => [
          s.date,
          s.client_name,
          productLabel(s.product),
          s.amount,
          s.type,
          s.closed_by,
          s.notes,
        ])
      );
      const expensesCsv = toCsv(
        ['date', 'category', 'amount', 'paid_by', 'notes'],
        (expensesRes.data || []).map((e) => [
          e.date,
          categoryLabel(e.category),
          e.amount,
          e.paid_by,
          e.notes,
        ])
      );

      downloadCsv(salesName, salesCsv);
      downloadCsv(expensesName, expensesCsv);
    },
    [year, monthIndex]
  );

  return (
    <div className="money" ref={formTopRef}>
      <MonthSwitcher
        year={year}
        monthIndex={monthIndex}
        onChange={onMonthChange}
      />

      {/* Add / edit form toggle */}
      <div className="seg form-toggle">
        <button
          type="button"
          className={mode === 'sale' ? 'on' : ''}
          onClick={() => onModeChange('sale')}
        >
          Add Sale
        </button>
        <button
          type="button"
          className={mode === 'expense' ? 'on' : ''}
          onClick={() => onModeChange('expense')}
        >
          Add Expense
        </button>
      </div>

      {mode === 'sale' ? (
        <SaleForm
          editing={editing && editing.kind === 'sale' ? editing : null}
          onSaved={() => {
            setEditing(null);
            loadMonth();
          }}
          onCancelEdit={cancelEdit}
        />
      ) : (
        <ExpenseForm
          editing={editing && editing.kind === 'expense' ? editing : null}
          onSaved={() => {
            setEditing(null);
            loadMonth();
          }}
          onCancelEdit={cancelEdit}
        />
      )}

      {/* Entries table */}
      <div className="card">
        <div className="card-label">This month</div>
        {loadError ? <div className="form-error">{loadError}</div> : null}
        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="muted load-line">No entries this month.</div>
        ) : (
          <div className="entry-list">
            {rows.map((entry) => (
              <EntryRow
                key={`${entry.kind}-${entry.id}`}
                entry={entry}
                onEdit={startEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <div className="month-totals">
          <span className="green">Sales {money(salesTotal)}</span>
          <span className="red">Expenses {money(expensesTotal)}</span>
        </div>

        <div className="row export-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => doExport('month')}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export month CSV'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => doExport('year')}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export year CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- CSV helpers ---------------- */

// Escape one CSV field: wrap in quotes and double internal quotes when the
// value contains a comma, quote, or newline. Null/undefined become empty.
function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Build a CSV string from a header row and an array of value rows.
function toCsv(headers, rows) {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }
  return lines.join('\r\n');
}

// Trigger a client-side download of a CSV string via a temporary <a>.
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Sale auto-effects ---------------- */

// Fire the side effects a brand-new sale triggers: inventory decrements,
// logo-stand print jobs, and recurring plan creation. Every branch is wrapped
// so a failure here can never block the sale that already committed.
async function runSaleAutoEffects({
  product,
  clientName,
  clientId,
  amount,
  type,
  date,
}) {
  // Kit sold -> consume 3 cards and 1 stand from inventory (never below 0).
  if (isKit(product)) {
    try {
      await decrementInventory('cards', 3);
    } catch {
      /* non-fatal */
    }
    try {
      await decrementInventory('stands', 1);
    } catch {
      /* non-fatal */
    }
  }

  // Product needs a printed logo stand -> queue a print job.
  if (needsLogoStand(product)) {
    try {
      await supabase.from('print_queue').insert({
        client: clientName || null,
        item: 'logo_stand',
        status: 'waiting',
        due_date: null,
      });
    } catch {
      /* non-fatal */
    }
  }

  // Recurring sale -> create the recurring plan row.
  if (type === 'recurring') {
    try {
      await supabase.from('recurring').insert({
        client_id: clientId || null,
        client_name: clientName || null,
        product,
        amount,
        start_date: date,
        active: true,
      });
    } catch {
      /* non-fatal */
    }
  }
}

// Fetch the current quantity for an inventory item and subtract `by`,
// clamped at 0. Skips silently if the row is missing.
async function decrementInventory(item, by) {
  const { data, error } = await supabase
    .from('inventory')
    .select('id, quantity')
    .eq('item', item)
    .maybeSingle();
  if (error || !data) return;
  const next = Math.max(0, Number(data.quantity || 0) - by);
  await supabase.from('inventory').update({ quantity: next }).eq('id', data.id);
}

/* ---------------- Sale form ---------------- */

function SaleForm({ editing, onSaved, onCancelEdit }) {
  const [date, setDate] = useState(localToday());
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState([]);
  const [product, setProduct] = useState('basic_kit');
  const [amount, setAmount] = useState(String(PRODUCTS[0].price));
  const [type, setType] = useState('one_time'); // 'one_time' | 'recurring'
  const [closedBy, setClosedBy] = useState('jack');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  // Load the client list for the optional picker (business_name order).
  useEffect(() => {
    let active = true;
    supabase
      .from('clients')
      .select('id, business_name, stage')
      .order('business_name', { ascending: true })
      .then(({ data }) => {
        if (active) setClients(data || []);
      });
    return () => {
      active = false;
    };
  }, []);

  // Populate from the row when entering edit mode.
  useEffect(() => {
    if (editing) {
      setDate(editing.date || localToday());
      setClientName(editing.client_name || '');
      setClientId(editing.client_id || '');
      setProduct(editing.product || 'other');
      setAmount(
        editing.amount === null || editing.amount === undefined
          ? ''
          : String(editing.amount)
      );
      setType(editing.type === 'recurring' ? 'recurring' : 'one_time');
      setClosedBy(editing.closed_by === 'jackson' ? 'jackson' : 'jack');
      setNotes(editing.notes || '');
      setError('');
    }
  }, [editing]);

  // Picking a client auto-fills the (still editable) client name text input.
  function onClientChange(value) {
    setClientId(value);
    if (!value) return;
    const c = clients.find((x) => x.id === value);
    if (c) setClientName(c.business_name || '');
  }

  function onProductChange(value) {
    setProduct(value);
    const p = productByValue(value);
    if (!p) return;
    // "Other" leaves amount empty for custom entry.
    if (p.value === 'other') {
      setAmount('');
    } else if (p.price !== null && p.price !== undefined) {
      setAmount(String(p.price));
    }
    // Auto-set recurring when the product is recurring; still user-overridable.
    setType(p.recurring ? 'recurring' : 'one_time');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    const amt = Number(amount);
    if (!clientName.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSaving(true);
    const payload = {
      date,
      client_name: clientName.trim(),
      client_id: clientId || null,
      product,
      amount: amt,
      type,
      closed_by: closedBy,
      notes: notes.trim() ? notes.trim() : null,
    };

    let res;
    if (isEdit) {
      res = await supabase.from('sales').update(payload).eq('id', editing.id);
    } else {
      res = await supabase.from('sales').insert(payload);
    }

    setSaving(false);
    if (res.error) {
      setError(res.error.message || 'Failed to save sale.');
      return;
    }

    // On a fresh sale tied to a client, promote lead/pitched -> sold.
    // Never downgrade a client already at 'sold' or 'care_plan'.
    if (!isEdit && clientId) {
      const c = clients.find((x) => x.id === clientId);
      if (c && (c.stage === 'lead' || c.stage === 'pitched')) {
        await supabase
          .from('clients')
          .update({ stage: 'sold' })
          .eq('id', clientId);
      }
    }

    // Auto-effects on new sales only (never on edits). Best-effort: any error
    // here is swallowed so it can't block or fail the sale that already saved.
    if (!isEdit) {
      await runSaleAutoEffects({
        product,
        clientName: clientName.trim(),
        clientId: clientId || null,
        amount: amt,
        type,
        date,
      });
    }

    if (isEdit) {
      onSaved();
    } else {
      // Optimistic clear, keep date + closed_by sticky for rapid entry.
      setClientName('');
      setClientId('');
      setProduct('basic_kit');
      setAmount(String(PRODUCTS[0].price));
      setType('one_time');
      setNotes('');
      onSaved();
    }
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">{isEdit ? 'Edit sale' : 'New sale'}</div>

      <div className="grid2">
        <div className="field">
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="label">Client</label>
          <select
            className="select"
            value={clientId}
            onChange={(e) => onClientChange(e.target.value)}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label">Client name</label>
        <input
          type="text"
          className="input"
          value={clientName}
          placeholder="Business name"
          onChange={(e) => setClientName(e.target.value)}
        />
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label">Product</label>
          <select
            className="select"
            value={product}
            onChange={(e) => onProductChange(e.target.value)}
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.price !== null && p.price !== undefined
                  ? `${p.label} — ${money(p.price)}`
                  : p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="label">Type</label>
        <div className="seg">
          <button
            type="button"
            className={type === 'one_time' ? 'on' : ''}
            onClick={() => setType('one_time')}
          >
            One-time
          </button>
          <button
            type="button"
            className={type === 'recurring' ? 'on' : ''}
            onClick={() => setType('recurring')}
          >
            Recurring
          </button>
        </div>
      </div>

      <div className="field">
        <label className="label">Closed by</label>
        <div className="seg">
          <button
            type="button"
            className={closedBy === 'jack' ? 'on' : ''}
            onClick={() => setClosedBy('jack')}
          >
            Jack
          </button>
          <button
            type="button"
            className={closedBy === 'jackson' ? 'on' : ''}
            onClick={() => setClosedBy('jackson')}
          >
            Jackson
          </button>
        </div>
      </div>

      <div className="field">
        <label className="label">Notes</label>
        <textarea
          className="textarea"
          value={notes}
          placeholder="Optional"
          onChange={(e) => setNotes(e.target.value)}
        />
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add sale'}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Expense form ---------------- */

function ExpenseForm({ editing, onSaved, onCancelEdit }) {
  const [date, setDate] = useState(localToday());
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('jack');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  useEffect(() => {
    if (editing) {
      setDate(editing.date || localToday());
      setCategory(editing.category || CATEGORIES[0].value);
      setAmount(
        editing.amount === null || editing.amount === undefined
          ? ''
          : String(editing.amount)
      );
      setPaidBy(editing.paid_by === 'jackson' ? 'jackson' : 'jack');
      setNotes(editing.notes || '');
      setError('');
    }
  }, [editing]);

  async function submit(e) {
    e.preventDefault();
    setError('');

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setSaving(true);
    const payload = {
      date,
      category,
      amount: amt,
      paid_by: paidBy,
      notes: notes.trim() ? notes.trim() : null,
    };

    let res;
    if (isEdit) {
      res = await supabase.from('expenses').update(payload).eq('id', editing.id);
    } else {
      res = await supabase.from('expenses').insert(payload);
    }

    setSaving(false);
    if (res.error) {
      setError(res.error.message || 'Failed to save expense.');
      return;
    }

    if (isEdit) {
      onSaved();
    } else {
      // Keep date + paid_by sticky for rapid entry.
      setCategory(CATEGORIES[0].value);
      setAmount('');
      setNotes('');
      onSaved();
    }
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">{isEdit ? 'Edit expense' : 'New expense'}</div>

      <div className="grid2">
        <div className="field">
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="label">Category</label>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label">Amount</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="input"
          value={amount}
          placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Paid by</label>
        <div className="seg">
          <button
            type="button"
            className={paidBy === 'jack' ? 'on' : ''}
            onClick={() => setPaidBy('jack')}
          >
            Jack
          </button>
          <button
            type="button"
            className={paidBy === 'jackson' ? 'on' : ''}
            onClick={() => setPaidBy('jackson')}
          >
            Jackson
          </button>
        </div>
      </div>

      <div className="field">
        <label className="label">Notes</label>
        <textarea
          className="textarea"
          value={notes}
          placeholder="Optional"
          onChange={(e) => setNotes(e.target.value)}
        />
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </form>
  );
}
