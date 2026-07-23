'use client';

import './dashboard.css';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  money,
  monthName,
  monthRange,
} from '../lib/catalog';
import EntryRow from '../components/EntryRow';

const GOAL = 10000;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [feed, setFeed] = useState([]);

  // Current LOCAL month, resolved once on mount.
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      const { first, last } = monthRange(year, monthIndex);

      const [salesRes, expensesRes, feedSalesRes, feedExpensesRes] =
        await Promise.all([
          supabase
            .from('sales')
            .select('*')
            .gte('date', first)
            .lte('date', last),
          supabase
            .from('expenses')
            .select('*')
            .gte('date', first)
            .lte('date', last),
          // Last-5 feed pulls recent rows regardless of month, then we merge.
          supabase
            .from('sales')
            .select('*')
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

      if (!active) return;

      const firstErr =
        salesRes.error ||
        expensesRes.error ||
        feedSalesRes.error ||
        feedExpensesRes.error;
      if (firstErr) {
        setError(firstErr.message || 'Failed to load data.');
        setLoading(false);
        return;
      }

      setSales(salesRes.data || []);
      setExpenses(expensesRes.data || []);

      const merged = [
        ...(feedSalesRes.data || []).map((s) => ({ ...s, kind: 'sale' })),
        ...(feedExpensesRes.data || []).map((e) => ({ ...e, kind: 'expense' })),
      ];
      merged.sort(sortNewestFirst);
      setFeed(merged.slice(0, 5));

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [year, monthIndex]);

  const revenue = useMemo(
    () => sum(sales.map((s) => s.amount)),
    [sales]
  );
  const expenseTotal = useMemo(
    () => sum(expenses.map((e) => e.amount)),
    [expenses]
  );
  const profit = revenue - expenseTotal;

  const pct = GOAL > 0 ? (revenue / GOAL) * 100 : 0;
  const barWidth = Math.min(100, pct);
  const overGoal = revenue >= GOAL;

  // Partner settlement on this month's expenses.
  const settlement = useMemo(() => {
    const jack = sum(
      expenses.filter((e) => e.paid_by === 'jack').map((e) => e.amount)
    );
    const jackson = sum(
      expenses.filter((e) => e.paid_by === 'jackson').map((e) => e.amount)
    );
    const diff = Math.abs(jack - jackson);
    const owed = diff / 2;
    let line;
    if (diff < 0.005) {
      line = 'All square.';
    } else if (jack > jackson) {
      line = `Jackson owes Jack ${money(owed)}`;
    } else {
      line = `Jack owes Jackson ${money(owed)}`;
    }
    return { jack, jackson, line };
  }, [expenses]);

  const label = `${monthName(monthIndex).toUpperCase()} GOAL`;

  if (loading) {
    return (
      <div className="dash">
        <div className="card goal-hero">
          <div className="card-label">{label}</div>
          <div className="muted">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      {error ? <div className="form-error">{error}</div> : null}

      {/* HERO */}
      <div className="card goal-hero">
        <div className="card-label">{label}</div>
        <div className="big-num green">{money(revenue)}</div>
        <div className="goal-track">
          <div
            className={`goal-fill${overGoal ? ' goal-fill-win' : ''}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="goal-caption muted">
          {money(revenue)} of {money(GOAL)} — {Math.round(pct)}%
          {overGoal ? ' — goal smashed!' : ''}
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="stat-row">
        <div className="card">
          <div className="card-label">Revenue</div>
          <div className="big-num green">{money(revenue)}</div>
        </div>
        <div className="card">
          <div className="card-label">Expenses</div>
          <div className="big-num red">{money(expenseTotal)}</div>
        </div>
        <div className="card">
          <div className="card-label">Profit</div>
          <div className={`big-num ${profit >= 0 ? 'green' : 'red'}`}>
            {money(profit)}
          </div>
        </div>
      </div>

      {/* SETTLEMENT */}
      <div className="card">
        <div className="card-label">Partner settlement</div>
        <div className="settle-line">{settlement.line}</div>
        <div className="settle-totals muted">
          <span>Jack paid {money(settlement.jack)}</span>
          <span>Jackson paid {money(settlement.jackson)}</span>
        </div>
      </div>

      {/* LATEST ACTIVITY */}
      <div className="card">
        <div className="card-label">Latest activity</div>
        {feed.length === 0 ? (
          <div className="muted">No activity yet.</div>
        ) : (
          <div className="feed-list">
            {feed.map((entry) => (
              <EntryRow key={`${entry.kind}-${entry.id}`} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function sum(nums) {
  return nums.reduce((acc, n) => acc + Number(n || 0), 0);
}

// Sort merged sale/expense rows newest first: date desc, then created_at desc.
function sortNewestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ca = a.created_at || '';
  const cb = b.created_at || '';
  if (ca === cb) return 0;
  return ca < cb ? 1 : -1;
}
