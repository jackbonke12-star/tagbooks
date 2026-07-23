'use client';

import './dashboard.css';
import Link from 'next/link';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../lib/realtime';
import {
  money,
  monthName,
  monthRange,
  localToday,
  shortDate,
  stageLabel,
  itemLabel,
} from '../lib/catalog';
import EntryRow from '../components/EntryRow';

// tel: href from a phone string (US +1, digits only). Null when no digits.
function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `tel:+1${digits}`;
}

const GOAL = 10000;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [feed, setFeed] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [recurringActive, setRecurringActive] = useState([]);
  const [printWaiting, setPrintWaiting] = useState([]);

  // Current LOCAL month, resolved once on mount.
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const { first, last } = monthRange(year, monthIndex);

    const today = localToday();

      const [
        salesRes,
        expensesRes,
        feedSalesRes,
        feedExpensesRes,
        followupsRes,
        recurringRes,
        printWaitingRes,
      ] = await Promise.all([
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
          // Clients whose follow-up is due today or overdue.
          supabase
            .from('clients')
            .select('*')
            .not('next_followup', 'is', null)
            .lte('next_followup', today)
            .order('next_followup', { ascending: true }),
          // Active recurring plans for the MRR card.
          supabase.from('recurring').select('*').eq('active', true),
          // Waiting print jobs for the mini list.
          supabase
            .from('print_queue')
            .select('*')
            .eq('status', 'waiting')
            .order('created_at', { ascending: true }),
        ]);

      const firstErr =
        salesRes.error ||
        expensesRes.error ||
        feedSalesRes.error ||
        feedExpensesRes.error ||
        followupsRes.error ||
        recurringRes.error ||
        printWaitingRes.error;
      if (firstErr) {
        setError(firstErr.message || 'Failed to load data.');
        setLoading(false);
        return;
      }

      setSales(salesRes.data || []);
      setExpenses(expensesRes.data || []);
      setFollowups(followupsRes.data || []);
      setRecurringActive(recurringRes.data || []);
      setPrintWaiting(printWaitingRes.data || []);

      const merged = [
        ...(feedSalesRes.data || []).map((s) => ({ ...s, kind: 'sale' })),
        ...(feedExpensesRes.data || []).map((e) => ({ ...e, kind: 'expense' })),
      ];
      merged.sort(sortNewestFirst);
      setFeed(merged.slice(0, 5));

      setLoading(false);
  }, [year, monthIndex]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when any dashboard table changes on any device.
  useRealtime(
    ['sales', 'expenses', 'clients', 'recurring', 'print_queue'],
    load
  );

  const revenue = useMemo(
    () => sum(sales.map((s) => s.amount)),
    [sales]
  );
  const expenseTotal = useMemo(
    () => sum(expenses.map((e) => e.amount)),
    [expenses]
  );
  const profit = revenue - expenseTotal;

  const mrr = useMemo(
    () => sum(recurringActive.map((r) => r.amount)),
    [recurringActive]
  );

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
          <div className="goal-hero-label">{label}</div>
          <div className="muted">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      {error ? <div className="form-error">{error}</div> : null}

      {/* FOLLOW-UPS DUE */}
      {followups.length > 0 ? (
        <div className="card">
          <div className="card-label">Follow-ups due</div>
          <div className="followup-list">
            {followups.map((client) => {
              const tel = telHref(client.phone);
              return (
                <div className="list-item followup-row" key={client.id}>
                  <div className="followup-main">
                    <span className="followup-name">
                      {client.business_name}
                    </span>
                    <span className={`chip chip-${client.stage}`}>
                      {stageLabel(client.stage)}
                    </span>
                  </div>
                  <div className="followup-meta">
                    <span className="red followup-date">
                      {shortDate(client.next_followup)}
                    </span>
                    {client.phone ? (
                      tel ? (
                        <a className="followup-tel green" href={tel}>
                          {client.phone}
                        </a>
                      ) : (
                        <span className="muted">{client.phone}</span>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* HERO — the centerpiece: the month's revenue against the $10k goal. */}
      <div className="card goal-hero">
        <div className="goal-hero-top">
          <div className="goal-hero-label">{label}</div>
          <div className="goal-hero-target muted">Target {money(GOAL)}</div>
        </div>
        <div className="goal-hero-num green">{money(revenue)}</div>
        <div className="goal-track">
          <div
            className={`goal-fill${overGoal ? ' goal-fill-win' : ''}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="goal-caption muted">
          {money(revenue)} of {money(GOAL)} &middot;{' '}
          <span className="goal-pct">{Math.round(pct)}%</span>
          {overGoal ? ' — goal smashed' : ''}
        </div>
      </div>

      {/* STAT TILES - compact 2x2 grid on phones, 4-across on wide. */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Revenue</div>
          <div className="stat-tile-value green">{money(revenue)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Expenses</div>
          <div className="stat-tile-value red">{money(expenseTotal)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Profit</div>
          <div className={`stat-tile-value ${profit >= 0 ? 'green' : 'red'}`}>
            {money(profit)}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Monthly recurring</div>
          <div className="stat-tile-value green">{money(mrr)}</div>
        </div>
      </div>

      {/* PRINT QUEUE - WAITING */}
      {printWaiting.length > 0 ? (
        <div className="card">
          <div className="card-label">Print queue — waiting</div>
          <div className="print-waiting-list">
            {printWaiting.map((job) => (
              <div className="list-item print-waiting-row" key={job.id}>
                <span className="print-waiting-item">{itemLabel(job.item)}</span>
                <span className="muted">{job.client || 'No client'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* SETTLEMENT */}
      <div className="card">
        <div className="card-label">Partner settlement</div>
        <div className="settle-line">{settlement.line}</div>
        <div className="settle-totals muted">
          <span>Jack paid {money(settlement.jack)}</span>
          <span>Jackson paid {money(settlement.jackson)}</span>
        </div>
      </div>

      {/* PITCH SCREEN LINK - quiet secondary link (Products lives under More). */}
      <div className="products-callout muted">
        Showing a client?{' '}
        <Link className="products-callout-link" href="/products">
          Open pitch screen
        </Link>
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

      {/* A small surprise tucked in the corner (Jackson's request). Decorative
          only: does not shift layout or block anything, works light/dark. */}
      <div className="corner-stamp" aria-hidden="true">
        <img
          className="corner-stamp-img"
          src="https://noildgtslvubjkifcifm.supabase.co/storage/v1/object/public/request-files/6ed54361-ee24-4012-9fa6-c8c1c4c73171/1784848430515-0-IMG_5693.PNG"
          alt=""
          loading="lazy"
        />
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
