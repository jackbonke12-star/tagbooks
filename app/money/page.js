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
  shortDate,
  isKit,
  needsLogoStand,
  ITEMS,
} from '../../lib/catalog';
import MonthSwitcher from '../../components/MonthSwitcher';
import EntryRow from '../../components/EntryRow';
import MoneyCalendar from '../../components/MoneyCalendar';

export default function MoneyPage() {
  // Selected LOCAL month.
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());

  // Which add form is showing.
  const [mode, setMode] = useState('sale'); // 'sale' | 'expense'

  // Which view of the month is showing.
  const [view, setView] = useState('entries'); // 'entries' | 'breakdown' | 'calendar'

  // Calendar: currently selected day (YYYY-MM-DD) or null for the whole month.
  const [selectedDay, setSelectedDay] = useState(null);

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

  // Spreadsheet breakdown for the selected month.
  // Income grouped by product; expenses grouped by category. Each group carries
  // a count + subtotal, sorted by subtotal (largest first).
  const incomeGroups = useMemo(
    () => groupBy(sales, (s) => s.product || 'other', productLabel),
    [sales]
  );
  const expenseGroups = useMemo(
    () => groupBy(expenses, (e) => e.category || 'other', categoryLabel),
    [expenses]
  );
  const net = salesTotal - expensesTotal;

  // Entries filtered to the selected calendar day (or all rows when none).
  const dayRows = useMemo(() => {
    if (!selectedDay) return rows;
    return rows.filter((r) => r.date === selectedDay);
  }, [rows, selectedDay]);

  function onMonthChange(y, m) {
    setEditing(null);
    setSelectedDay(null);
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
        ['date', 'category', 'amount', 'paid_by', 'where_bought', 'notes'],
        (expensesRes.data || []).map((e) => [
          e.date,
          categoryLabel(e.category),
          e.amount,
          e.paid_by,
          e.vendor,
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
      <div className="page-head">
        <h1 className="page-title">Money</h1>
        <p className="page-title-sub">
          Log every sale and expense, then see how the month added up.
        </p>
      </div>

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
          Add sale
        </button>
        <button
          type="button"
          className={mode === 'expense' ? 'on' : ''}
          onClick={() => onModeChange('expense')}
        >
          Add expense
        </button>
      </div>
      <p className="mode-hint muted">
        {mode === 'sale'
          ? 'Money coming in — record a job you closed.'
          : 'Money going out — record something you bought.'}
      </p>

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

      {/* View toggle: Entries / Breakdown / Calendar */}
      <div className="seg view-toggle">
        <button
          type="button"
          className={view === 'entries' ? 'on' : ''}
          onClick={() => setView('entries')}
        >
          Entries
        </button>
        <button
          type="button"
          className={view === 'breakdown' ? 'on' : ''}
          onClick={() => setView('breakdown')}
        >
          Breakdown
        </button>
        <button
          type="button"
          className={view === 'calendar' ? 'on' : ''}
          onClick={() => setView('calendar')}
        >
          Calendar
        </button>
      </div>
      <p className="view-hint muted">
        {view === 'entries'
          ? 'Every sale and expense this month, newest first.'
          : view === 'breakdown'
          ? 'Totals grouped by product and category, with the bottom-line net.'
          : 'Tap any day to see just that day’s entries.'}
      </p>

      {/* ENTRIES view: the existing list */}
      {view === 'entries' ? (
        <div className="card">
          <div className="card-label">This month</div>
          {loadError ? <div className="form-error">{loadError}</div> : null}
          {loading ? (
            <div className="muted load-line">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="muted load-line">
              Nothing logged this month yet. Use Add sale or Add expense above to
              start the ledger.
            </div>
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
      ) : null}

      {/* BREAKDOWN view: spreadsheet-style ledger */}
      {view === 'breakdown' ? (
        <div className="card">
          <div className="card-label">Breakdown</div>
          {loadError ? <div className="form-error">{loadError}</div> : null}
          {loading ? (
            <div className="muted load-line">Loading…</div>
          ) : (
            <BreakdownTable
              incomeGroups={incomeGroups}
              expenseGroups={expenseGroups}
              salesTotal={salesTotal}
              expensesTotal={expensesTotal}
              net={net}
            />
          )}
        </div>
      ) : null}

      {/* CALENDAR view: month grid + selected-day entries */}
      {view === 'calendar' ? (
        <div className="card">
          <div className="card-label">Calendar</div>
          {loadError ? <div className="form-error">{loadError}</div> : null}
          {loading ? (
            <div className="muted load-line">Loading…</div>
          ) : (
            <>
              <MoneyCalendar
                year={year}
                monthIndex={monthIndex}
                sales={sales}
                expenses={expenses}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />

              <div className="cal-day-panel">
                <div className="cal-day-panel-head">
                  <span className="cal-day-panel-title">
                    {selectedDay ? shortDate(selectedDay) : 'Whole month'}
                  </span>
                  {selectedDay ? (
                    <button
                      type="button"
                      className="cal-clear-day"
                      onClick={() => setSelectedDay(null)}
                    >
                      Show whole month
                    </button>
                  ) : null}
                </div>
                {dayRows.length === 0 ? (
                  <div className="muted load-line">
                    {selectedDay
                      ? 'Nothing on this day. Tap another day above.'
                      : 'Nothing logged this month yet.'}
                  </div>
                ) : (
                  <div className="entry-list">
                    {dayRows.map((entry) => (
                      <EntryRow
                        key={`${entry.kind}-${entry.id}`}
                        entry={entry}
                        onEdit={startEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Breakdown helpers ---------------- */

// Group rows by a key, summing amount and counting rows per group. Returns an
// array of { key, label, count, total } sorted by total descending.
function groupBy(list, keyFn, labelFn) {
  const map = new Map();
  for (const row of list) {
    const key = keyFn(row);
    const cur = map.get(key) || { key, label: labelFn(key), count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(row.amount || 0);
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// Percent-of-total string for a group, e.g. "42%". Empty when the total is 0.
function pct(part, whole) {
  if (!whole) return '';
  return `${Math.round((part / whole) * 100)}%`;
}

/* ---------------- Breakdown table ---------------- */

// Excel/spreadsheet-style ledger for the month: an INCOME section grouped by
// product and an EXPENSES section grouped by category, each with count +
// subtotal + share, then colored TOTAL rows and a NET row.
function BreakdownTable({
  incomeGroups,
  expenseGroups,
  salesTotal,
  expensesTotal,
  net,
}) {
  const empty = incomeGroups.length === 0 && expenseGroups.length === 0;
  if (empty) {
    return <div className="muted load-line">No entries this month.</div>;
  }
  return (
    <div className="bd-scroll">
      <table className="bd-table">
        <colgroup>
          <col className="bd-col-name" />
          <col className="bd-col-count" />
          <col className="bd-col-share" />
          <col className="bd-col-amount" />
        </colgroup>
        <thead>
          <tr className="bd-section-row">
            <th colSpan={4} className="bd-section green">
              Income
            </th>
          </tr>
          <tr className="bd-head-row">
            <th className="bd-l">Product</th>
            <th className="bd-r">Qty</th>
            <th className="bd-r">Share</th>
            <th className="bd-r">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {incomeGroups.length === 0 ? (
            <tr className="bd-row">
              <td className="bd-l muted" colSpan={4}>
                No income this month.
              </td>
            </tr>
          ) : (
            incomeGroups.map((g) => (
              <tr key={g.key} className="bd-row">
                <td className="bd-l">{g.label}</td>
                <td className="bd-r bd-num">{g.count}</td>
                <td className="bd-r bd-num muted">{pct(g.total, salesTotal)}</td>
                <td className="bd-r bd-num">{money(g.total)}</td>
              </tr>
            ))
          )}
          <tr className="bd-total-row">
            <td className="bd-l green">Total income</td>
            <td className="bd-r" />
            <td className="bd-r" />
            <td className="bd-r bd-num green">{money(salesTotal)}</td>
          </tr>
        </tbody>

        <thead>
          <tr className="bd-section-row">
            <th colSpan={4} className="bd-section red">
              Expenses
            </th>
          </tr>
          <tr className="bd-head-row">
            <th className="bd-l">Category</th>
            <th className="bd-r">Qty</th>
            <th className="bd-r">Share</th>
            <th className="bd-r">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {expenseGroups.length === 0 ? (
            <tr className="bd-row">
              <td className="bd-l muted" colSpan={4}>
                No expenses this month.
              </td>
            </tr>
          ) : (
            expenseGroups.map((g) => (
              <tr key={g.key} className="bd-row">
                <td className="bd-l">{g.label}</td>
                <td className="bd-r bd-num">{g.count}</td>
                <td className="bd-r bd-num muted">
                  {pct(g.total, expensesTotal)}
                </td>
                <td className="bd-r bd-num">{money(g.total)}</td>
              </tr>
            ))
          )}
          <tr className="bd-total-row">
            <td className="bd-l red">Total expenses</td>
            <td className="bd-r" />
            <td className="bd-r" />
            <td className="bd-r bd-num red">{money(expensesTotal)}</td>
          </tr>
        </tbody>

        <tfoot>
          <tr className="bd-net-row">
            <td className="bd-l">Net</td>
            <td className="bd-r" />
            <td className="bd-r" />
            <td className={`bd-r bd-num ${net >= 0 ? 'green' : 'red'}`}>
              {money(net)}
            </td>
          </tr>
        </tfoot>
      </table>
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

  // Tracks the last amount we auto-filled from a product's default price. Lets us
  // safely re-fill on product change WITHOUT clobbering a number Jack typed by
  // hand: we only overwrite when amount is empty or still equals this default.
  const autoAmountRef = useRef(String(PRODUCTS[0].price));

  // Client typeahead: what's typed in the search box + whether the dropdown is
  // open. The search box only picks a client; the editable "Client name" field
  // below is still the source of truth for the saved name.
  const [clientQuery, setClientQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const clientSearchRef = useRef(null);

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

  // Default a fresh sale's "Closed by" to the last person who closed one.
  // SSR-safe: read localStorage in a mount effect, never during render. Only
  // applies to new entries (edit mode loads the row's real value below).
  useEffect(() => {
    if (editing) return;
    try {
      const last = localStorage.getItem('tagbooks-last-closed-by');
      if (last === 'jack' || last === 'jackson') setClosedBy(last);
    } catch {
      /* localStorage unavailable */
    }
  }, [editing]);

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

  // Case-insensitive substring match on business_name. Empty query shows all
  // (capped) so the box also works as a plain picker.
  const clientMatches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const list = q
      ? clients.filter((c) =>
          (c.business_name || '').toLowerCase().includes(q)
        )
      : clients;
    return list.slice(0, 30);
  }, [clients, clientQuery]);

  // Select a client from the dropdown: link the id, auto-fill the name, and
  // reset the search box to a clean, closed state.
  function pickClient(c) {
    onClientChange(c.id);
    setClientQuery('');
    setClientOpen(false);
  }

  // Clear the linked client (back to a manual/"No client" sale). The editable
  // client name field is left as-is so a typed name isn't wiped.
  function clearClient() {
    setClientId('');
    setClientQuery('');
    setClientOpen(false);
  }

  // Close the dropdown when focus/click leaves the search cluster.
  useEffect(() => {
    if (!clientOpen) return;
    function onDocPointer(e) {
      if (
        clientSearchRef.current &&
        !clientSearchRef.current.contains(e.target)
      ) {
        setClientOpen(false);
      }
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [clientOpen]);

  // The currently linked client (for the "linked" confirmation chip).
  const linkedClient = clientId
    ? clients.find((x) => x.id === clientId)
    : null;

  // Distinct business names for the client-name datalist (repeat-customer
  // autocomplete). Reuses the clients already loaded above — no extra query.
  const clientNameOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of clients) {
      const name = (c.business_name || '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  }, [clients]);

  function onProductChange(value) {
    setProduct(value);
    const p = productByValue(value);
    if (!p) return;
    // Autofill the amount from the product's default price, but NEVER overwrite a
    // number Jack typed himself: only fill when the field is empty or still holds
    // the price we last auto-filled. "Other" (no price) leaves the amount alone.
    const canAutofill =
      amount === '' || amount === autoAmountRef.current;
    if (canAutofill) {
      if (p.value === 'other') {
        setAmount('');
        autoAmountRef.current = '';
      } else if (p.price !== null && p.price !== undefined) {
        const next = String(p.price);
        setAmount(next);
        autoAmountRef.current = next;
      }
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

    // Remember who closed this so the next new sale defaults to them.
    try {
      localStorage.setItem('tagbooks-last-closed-by', closedBy);
    } catch {
      /* localStorage unavailable */
    }

    if (isEdit) {
      onSaved();
    } else {
      // Optimistic clear, keep date + closed_by sticky for rapid entry.
      setClientName('');
      setClientId('');
      setProduct('basic_kit');
      setAmount(String(PRODUCTS[0].price));
      autoAmountRef.current = String(PRODUCTS[0].price);
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
          <label className="label">Find client</label>
          <div className="client-search" ref={clientSearchRef}>
            <input
              type="text"
              className="input"
              value={clientQuery}
              placeholder="Search business name…"
              autoComplete="off"
              onFocus={() => setClientOpen(true)}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setClientOpen(true);
              }}
            />
            {clientOpen ? (
              <div className="client-search-menu" role="listbox">
                {clientMatches.length === 0 ? (
                  <div className="client-search-empty muted">
                    No matching clients
                  </div>
                ) : (
                  clientMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={c.id === clientId}
                      className={`client-search-item${
                        c.id === clientId ? ' on' : ''
                      }`}
                      onClick={() => pickClient(c)}
                    >
                      {c.business_name}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          {linkedClient ? (
            <div className="client-linked">
              <span className="client-linked-tag">Linked</span>
              <span className="client-linked-name">
                {linkedClient.business_name}
              </span>
              <button
                type="button"
                className="client-linked-clear"
                onClick={clearClient}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="field">
        <label className="label">Client name</label>
        <input
          type="text"
          className="input"
          value={clientName}
          placeholder="Business name"
          list="sale-client-names"
          autoComplete="off"
          onChange={(e) => setClientName(e.target.value)}
        />
        <datalist id="sale-client-names">
          {clientNameOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  // Inventory order: when on, this purchase is stock we're expecting.
  const [toStock, setToStock] = useState(false);
  const [invItem, setInvItem] = useState(ITEMS[0].value);
  const [invQty, setInvQty] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Distinct vendors already used, for the "Where bought" datalist.
  const [vendorOptions, setVendorOptions] = useState([]);

  const isEdit = !!editing;

  // Default a fresh expense's "Paid by" + "Category" to the last ones used.
  // SSR-safe: read localStorage in a mount effect, never during render. Skipped
  // in edit mode (the row's real values load below).
  useEffect(() => {
    if (editing) return;
    try {
      const lastPaid = localStorage.getItem('tagbooks-last-paid-by');
      if (lastPaid === 'jack' || lastPaid === 'jackson') setPaidBy(lastPaid);
      const lastCat = localStorage.getItem('tagbooks-last-expense-category');
      if (lastCat && CATEGORIES.some((c) => c.value === lastCat)) {
        setCategory(lastCat);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [editing]);

  // Load distinct vendors from past expenses once, for repeat-vendor
  // autocomplete. One lightweight query; no realtime needed.
  useEffect(() => {
    let active = true;
    supabase
      .from('expenses')
      .select('vendor')
      .not('vendor', 'is', null)
      .then(({ data }) => {
        if (!active) return;
        const seen = new Set();
        const out = [];
        for (const r of data || []) {
          const v = (r.vendor || '').trim();
          if (v && !seen.has(v)) {
            seen.add(v);
            out.push(v);
          }
        }
        out.sort((a, b) => a.localeCompare(b));
        setVendorOptions(out);
      });
    return () => {
      active = false;
    };
  }, []);

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
      setVendor(editing.vendor || '');
      setNotes(editing.notes || '');
      setToStock(!!editing.inv_item);
      setInvItem(editing.inv_item || ITEMS[0].value);
      setInvQty(
        editing.inv_qty === null || editing.inv_qty === undefined
          ? ''
          : String(editing.inv_qty)
      );
      setArrivalDate(editing.arrival_date || '');
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

    const orderQty = Number(invQty);
    if (toStock && (!Number.isFinite(orderQty) || orderQty <= 0)) {
      setError('Enter how many units you ordered.');
      return;
    }

    setSaving(true);
    const payload = {
      date,
      category,
      amount: amt,
      paid_by: paidBy,
      vendor: vendor.trim() ? vendor.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      // Inventory order fields (null when this isn't a stock purchase).
      inv_item: toStock ? invItem : null,
      inv_qty: toStock ? orderQty : null,
      arrival_date: toStock ? arrivalDate || null : null,
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

    // Remember paid-by + category so the next new expense defaults to them.
    try {
      localStorage.setItem('tagbooks-last-paid-by', paidBy);
      localStorage.setItem('tagbooks-last-expense-category', category);
    } catch {
      /* localStorage unavailable */
    }

    // Fold a freshly-typed vendor into the autocomplete list right away.
    const v = vendor.trim();
    if (v && !vendorOptions.includes(v)) {
      setVendorOptions((prev) =>
        [...prev, v].sort((a, b) => a.localeCompare(b))
      );
    }

    if (isEdit) {
      onSaved();
    } else {
      // Keep date + paid_by + category sticky for rapid entry.
      setCategory(category);
      setAmount('');
      setVendor('');
      setNotes('');
      setToStock(false);
      setInvItem(ITEMS[0].value);
      setInvQty('');
      setArrivalDate('');
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
        <label className="label">Where bought</label>
        <input
          type="text"
          className="input"
          value={vendor}
          placeholder="e.g. Amazon, Staples (optional)"
          list="expense-vendors"
          autoComplete="off"
          onChange={(e) => setVendor(e.target.value)}
        />
        <datalist id="expense-vendors">
          {vendorOptions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <label className="exp-stock-toggle">
          <input
            type="checkbox"
            checked={toStock}
            onChange={(e) => setToStock(e.target.checked)}
          />
          This is an inventory order (stock coming in)
        </label>
        <p className="exp-stock-caption muted">
          Tick this when you’re buying supplies to restock — it’ll appear in the
          Inventory tab as an incoming order.
        </p>
      </div>

      {toStock ? (
        <div className="exp-stock-fields">
          <div className="grid2">
            <div className="field">
              <label className="label">Item</label>
              <select
                className="select"
                value={invItem}
                onChange={(e) => setInvItem(e.target.value)}
              >
                {ITEMS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Quantity ordered</label>
              <input
                type="number"
                min="1"
                step="1"
                className="input"
                value={invQty}
                placeholder="e.g. 50"
                onChange={(e) => setInvQty(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="label">Expected arrival</label>
            <input
              type="date"
              className="input"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
            />
          </div>
          <p className="exp-stock-hint">
            This shows up in the Inventory tab as an incoming order. When it
            arrives, tap “Mark received” there and the quantity is added to your
            stock.
          </p>
        </div>
      ) : null}

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
