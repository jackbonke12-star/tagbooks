'use client';

import './money.css';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  PRODUCTS,
  CATEGORIES,
  productByValue,
  money,
  localToday,
  monthRange,
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
          <div className="muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="muted">No entries this month.</div>
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
      </div>
    </div>
  );
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
