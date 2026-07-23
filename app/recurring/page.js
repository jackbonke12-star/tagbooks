'use client';

import './recurring.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { money, productLabel, shortDate } from '../../lib/catalog';

// Frequency options for recurring expenses. `per` is the short suffix, `months`
// is how many months one charge covers (used to normalize to a monthly cost).
const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly', per: '/mo', months: 1 },
  { value: 'quarterly', label: 'Quarterly', per: '/qtr', months: 3 },
  { value: 'yearly', label: 'Yearly', per: '/yr', months: 12 },
];

const PAID_BY = [
  { value: 'jack', label: 'Jack' },
  { value: 'jackson', label: 'Jackson' },
];

function frequencyMeta(value) {
  return FREQUENCIES.find((f) => f.value === value) || FREQUENCIES[0];
}

function paidByLabel(value) {
  const p = PAID_BY.find((x) => x.value === value);
  return p ? p.label : value || '';
}

// Normalize any frequency's amount to a monthly figure.
function monthlyCost(expense) {
  const amount = Number(expense.amount || 0);
  const { months } = frequencyMeta(expense.frequency);
  return months ? amount / months : amount;
}

export default function RecurringPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('recurring')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load recurring plans.');
      setLoading(false);
      return;
    }
    setPlans(data || []);
    setLoading(false);
  }, []);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    const { data, error } = await supabase
      .from('recurring_expenses')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load recurring expenses.');
      setExpensesLoading(false);
      return;
    }
    setExpenses(data || []);
    setExpensesLoading(false);
  }, []);

  useEffect(() => {
    load();
    loadExpenses();
  }, [load, loadExpenses]);

  // Live updates: reload when recurring plans / expenses change on any device.
  useRealtime(['recurring'], load);
  useRealtime(['recurring_expenses'], loadExpenses);

  const active = useMemo(() => plans.filter((p) => p.active), [plans]);
  const inactive = useMemo(() => plans.filter((p) => !p.active), [plans]);

  const mrr = useMemo(
    () => active.reduce((a, p) => a + Number(p.amount || 0), 0),
    [active]
  );

  const activeExpenses = useMemo(
    () => expenses.filter((e) => e.active),
    [expenses]
  );
  const cancelledExpenses = useMemo(
    () => expenses.filter((e) => !e.active),
    [expenses]
  );

  // Total recurring cost, normalized to a monthly figure across frequencies.
  const recurringCost = useMemo(
    () => activeExpenses.reduce((a, e) => a + monthlyCost(e), 0),
    [activeExpenses]
  );

  const cancelPlan = useCallback(
    async (plan) => {
      if (
        !window.confirm(
          `Cancel the ${productLabel(plan.product)} plan for ${
            plan.client_name || 'this client'
          }?`
        )
      )
        return;
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, active: false } : p))
      );
      const { error } = await supabase
        .from('recurring')
        .update({ active: false })
        .eq('id', plan.id);
      if (error) {
        setLoadError(error.message || 'Failed to cancel plan.');
        load();
      }
    },
    [load]
  );

  const cancelExpense = useCallback(
    async (expense) => {
      if (
        !window.confirm(
          `Cancel the recurring expense "${expense.name || 'this expense'}"?`
        )
      )
        return;
      setExpenses((prev) =>
        prev.map((e) => (e.id === expense.id ? { ...e, active: false } : e))
      );
      const { error } = await supabase
        .from('recurring_expenses')
        .update({ active: false })
        .eq('id', expense.id);
      if (error) {
        setLoadError(error.message || 'Failed to cancel expense.');
        loadExpenses();
      }
    },
    [loadExpenses]
  );

  return (
    <div className="recurring">
      {loadError ? <div className="form-error">{loadError}</div> : null}

      {/* MRR hero */}
      <div className="card mrr-hero">
        <div className="card-label">Monthly recurring</div>
        <div className="big-num green">{money(mrr)}</div>
        <div className="mrr-caption muted">
          {active.length} active plan{active.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Active plans */}
      <div className="card">
        <div className="card-label">Active plans</div>
        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : active.length === 0 ? (
          <div className="muted load-line">No active plans.</div>
        ) : (
          <div className="rec-list">
            {active.map((plan) => (
              <div className="rec-row" key={plan.id}>
                <div className="rec-main">
                  <span className="rec-name">
                    {plan.client_name || 'No client'}
                  </span>
                  <span className="rec-sub">
                    {productLabel(plan.product)}
                    {plan.start_date
                      ? ` · since ${shortDate(plan.start_date)}`
                      : ''}
                  </span>
                </div>
                <div className="rec-right">
                  <span className="rec-amount green">
                    {money(plan.amount)}/mo
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger rec-cancel"
                    onClick={() => cancelPlan(plan)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancelled / inactive plans */}
      {inactive.length > 0 ? (
        <div className="card">
          <div className="card-label">Cancelled</div>
          <div className="rec-list">
            {inactive.map((plan) => (
              <div className="rec-row rec-inactive" key={plan.id}>
                <div className="rec-main">
                  <span className="rec-name">
                    {plan.client_name || 'No client'}
                  </span>
                  <span className="rec-sub">
                    {productLabel(plan.product)}
                    {plan.start_date
                      ? ` · since ${shortDate(plan.start_date)}`
                      : ''}
                  </span>
                </div>
                <div className="rec-right">
                  <span className="rec-amount muted">
                    {money(plan.amount)}/mo
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- Recurring expenses (subscriptions / recurring costs) ---------- */}

      {/* Recurring cost hero (red: it's a cost). */}
      <div className="card cost-hero">
        <div className="card-label">Recurring cost</div>
        <div className="big-num red">{money(recurringCost)}</div>
        <div className="mrr-caption muted">
          {activeExpenses.length} active expense
          {activeExpenses.length === 1 ? '' : 's'} · per month
        </div>
      </div>

      {/* Add recurring expense */}
      <ExpenseForm onSaved={loadExpenses} setLoadError={setLoadError} />

      {/* Active recurring expenses */}
      <div className="card">
        <div className="card-label">Recurring expenses</div>
        {expensesLoading ? (
          <div className="muted load-line">Loading…</div>
        ) : activeExpenses.length === 0 ? (
          <div className="muted load-line">No recurring expenses.</div>
        ) : (
          <div className="rec-list">
            {activeExpenses.map((expense) => {
              const meta = frequencyMeta(expense.frequency);
              const bits = [
                expense.category,
                paidByLabel(expense.paid_by),
              ].filter(Boolean);
              return (
                <div className="rec-row" key={expense.id}>
                  <div className="rec-main">
                    <span className="rec-name">{expense.name}</span>
                    {bits.length ? (
                      <span className="rec-sub">{bits.join(' · ')}</span>
                    ) : null}
                  </div>
                  <div className="rec-right">
                    <span className="rec-amount red">
                      {money(expense.amount)}
                      {meta.per}
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger rec-cancel"
                      onClick={() => cancelExpense(expense)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancelled recurring expenses */}
      {cancelledExpenses.length > 0 ? (
        <div className="card">
          <div className="card-label">Cancelled expenses</div>
          <div className="rec-list">
            {cancelledExpenses.map((expense) => {
              const meta = frequencyMeta(expense.frequency);
              const bits = [
                expense.category,
                paidByLabel(expense.paid_by),
              ].filter(Boolean);
              return (
                <div className="rec-row rec-inactive" key={expense.id}>
                  <div className="rec-main">
                    <span className="rec-name">{expense.name}</span>
                    {bits.length ? (
                      <span className="rec-sub">{bits.join(' · ')}</span>
                    ) : null}
                  </div>
                  <div className="rec-right">
                    <span className="rec-amount muted">
                      {money(expense.amount)}
                      {meta.per}
                    </span>
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

/* ---------------- Recurring expense form ---------------- */

function ExpenseForm({ onSaved, setLoadError }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [category, setCategory] = useState('');
  const [paidBy, setPaidBy] = useState('jack');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName('');
    setAmount('');
    setFrequency('monthly');
    setCategory('');
    setNotes('');
    // paidBy stays sticky for fast repeat entry.
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const amt = Number(amount);
    if (!amount.trim() || !Number.isFinite(amt) || amt <= 0) {
      setError('Amount is required.');
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      amount: amt,
      frequency,
      category: category.trim() ? category.trim() : null,
      paid_by: paidBy,
      notes: notes.trim() ? notes.trim() : null,
      active: true,
    };

    const { error: insertError } = await supabase
      .from('recurring_expenses')
      .insert(payload);

    setSaving(false);
    if (insertError) {
      setError(insertError.message || 'Failed to add expense.');
      return;
    }

    resetForm();
    if (setLoadError) setLoadError('');
    onSaved();
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">New recurring expense</div>

      <div className="grid2">
        <div className="field">
          <label className="label">Name</label>
          <input
            type="text"
            className="input"
            value={name}
            placeholder="e.g. Supabase, Domain"
            onChange={(ev) => setName(ev.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Amount</label>
          <input
            type="number"
            className="input"
            value={amount}
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            onChange={(ev) => setAmount(ev.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="label">Frequency</label>
        <div className="seg">
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              className={frequency === f.value ? 'on' : ''}
              onClick={() => setFrequency(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label">Category</label>
        <input
          type="text"
          className="input"
          value={category}
          placeholder="Optional (e.g. Software, Hardware)"
          autoComplete="off"
          onChange={(ev) => setCategory(ev.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Paid by</label>
        <div className="seg">
          {PAID_BY.map((p) => (
            <button
              key={p.value}
              type="button"
              className={paidBy === p.value ? 'on' : ''}
              onClick={() => setPaidBy(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label">Notes</label>
        <textarea
          className="textarea"
          value={notes}
          placeholder="Optional"
          onChange={(ev) => setNotes(ev.target.value)}
        />
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add expense'}
        </button>
      </div>
    </form>
  );
}
