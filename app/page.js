'use client';

import './dashboard.css';
import Link from 'next/link';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
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
  ITEMS,
} from '../lib/catalog';
import EntryRow from '../components/EntryRow';

// tel: href from a phone string (US +1, digits only). Null when no digits.
function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `tel:+1${digits}`;
}

// Deep link to the Quote builder, prefilled with a business name + phone.
function quoteHref(name, phone) {
  const params = new URLSearchParams();
  params.set('name', name || '');
  if (phone) params.set('phone', phone);
  return `/quote?${params.toString()}`;
}

// Reorder URL for an inventory item value, from the shared catalog.
function reorderUrlFor(value) {
  const it = ITEMS.find((x) => x.value === value);
  return it ? it.reorderUrl : '';
}

// Low-stock thresholds, one per item value. Below the threshold = reorder.
const LOW_STOCK = { cards: 20, filament_rolls: 1, stickers: 20 };

const GOAL = 10000;

// Quick count-up for the hero figure. SSR/hydration-safe: state initializes to
// the real target so the server render and the first client render match
// exactly (no mismatch, no flash). The animation only ever runs AFTER mount,
// and only when the user hasn't asked to reduce motion. It is entrance-only —
// once it settles on `target` it stays there, and a later realtime change to
// `target` snaps in place (no re-animation, no layout shift).
function useCountUp(target, active, duration = 600) {
  const [value, setValue] = useState(target);
  // Track whether we've already played the one entrance animation.
  const played = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    // Wait until data has loaded before considering the entrance.
    if (!active) return;

    // After the entrance has played once, later target changes (realtime) just
    // snap the figure into place — no replay, no layout shift.
    if (played.current) {
      setValue(target);
      return;
    }
    played.current = true;

    // Respect reduced-motion and non-animatable/degenerate targets.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target) || target <= 0) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;
    const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active, duration]);

  return value;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [feed, setFeed] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [prospectFollowups, setProspectFollowups] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [toVisitCount, setToVisitCount] = useState(0);
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
        prospectFollowupsRes,
        toVisitRes,
        inventoryRes,
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
          // Prospects (Places leads) whose follow-up is due today or overdue,
          // still in the funnel (not won, not skipped).
          supabase
            .from('prospects')
            .select('*')
            .not('followup_date', 'is', null)
            .lte('followup_date', today)
            .not('status', 'in', '(won,skip)')
            .order('followup_date', { ascending: true }),
          // Count of prospects still queued to visit (the scouting nudge).
          supabase
            .from('prospects')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'to_visit'),
          // On-hand stock, to flag any item that's running low.
          supabase.from('inventory').select('*'),
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
        prospectFollowupsRes.error ||
        toVisitRes.error ||
        inventoryRes.error ||
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
      setProspectFollowups(prospectFollowupsRes.data || []);
      setInventory(inventoryRes.data || []);
      setToVisitCount(toVisitRes.count || 0);
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
    [
      'sales',
      'expenses',
      'clients',
      'prospects',
      'inventory',
      'recurring',
      'print_queue',
    ],
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

  // Days left in the month + the daily pace still needed to hit the goal, and
  // where you *should* be by today at an even pace (the marker on the bar).
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth + 1);
  const remainingToGoal = Math.max(0, GOAL - revenue);
  const perDay = daysLeft > 0 ? remainingToGoal / daysLeft : remainingToGoal;
  const expectedPct = Math.min(100, (dayOfMonth / daysInMonth) * 100);
  const onPace = pct >= expectedPct;

  // Hero figure counts up once on load (mount-gated, reduced-motion aware).
  const heroRevenue = useCountUp(revenue, !loading);

  // Meter fills from 0 to its real width once, on load. Rendering 0 first then
  // the real width after mount lets the CSS `transition: width` animate the
  // fill in. It lives inside a fixed-height track, so nothing shifts. After the
  // first paint `meterReady` stays true, so realtime width changes just glide
  // via the same transition without re-running an entrance.
  const [meterReady, setMeterReady] = useState(false);
  useEffect(() => {
    if (loading || meterReady) return;
    // Next frame so the browser paints the 0-width fill first, then animates.
    const id = requestAnimationFrame(() => setMeterReady(true));
    return () => cancelAnimationFrame(id);
  }, [loading, meterReady]);

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

  // ---- TODAY action center ----
  // One prioritized list of real next-actions, built from live data. Each item
  // carries a `rank` (0 overdue, 1 due today, 2 nudge) so the list sorts into
  // "handle this first" order. Dates are LOCAL strings, compared as strings.
  const today = localToday();
  const todayItems = useMemo(() => {
    const items = [];

    // CLIENT follow-ups (already filtered to due/overdue in the query).
    for (const c of followups) {
      const overdue = c.next_followup < today;
      items.push({
        key: `client-${c.id}`,
        kind: 'followup',
        rank: overdue ? 0 : 1,
        overdue,
        name: c.business_name || 'Client',
        stage: c.stage,
        due: c.next_followup,
        phone: c.phone || '',
        tel: telHref(c.phone),
        quote: quoteHref(c.business_name, c.phone),
        clientHref: `/clients?q=${encodeURIComponent(c.business_name || '')}`,
      });
    }

    // PROSPECT follow-ups (Places leads due/overdue, still in the funnel).
    for (const p of prospectFollowups) {
      const overdue = p.followup_date < today;
      items.push({
        key: `prospect-${p.id}`,
        kind: 'prospect',
        rank: overdue ? 0 : 1,
        overdue,
        name: p.name || 'Prospect',
        due: p.followup_date,
        phone: p.phone || '',
        tel: telHref(p.phone),
        quote: quoteHref(p.name, p.phone),
      });
    }

    // LOW STOCK — one item per inventory row below its threshold.
    for (const row of inventory) {
      const threshold = LOW_STOCK[row.item];
      if (threshold == null) continue;
      const qty = Number(row.quantity || 0);
      if (qty >= threshold) continue;
      items.push({
        key: `stock-${row.item}`,
        kind: 'stock',
        rank: 0, // out/low stock blocks fulfilment — treat as urgent.
        name: itemLabel(row.item),
        qty,
        reorderUrl: reorderUrlFor(row.item),
      });
    }

    // Gentle scouting nudge: prospects still queued to visit.
    if (toVisitCount > 0) {
      items.push({
        key: 'to-visit',
        kind: 'visit',
        rank: 2,
        count: toVisitCount,
      });
    }

    // Overdue first, then due-today, then nudges. Stable within a rank.
    items.sort((a, b) => a.rank - b.rank);
    return items;
  }, [followups, prospectFollowups, inventory, toVisitCount, today]);

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
      {/* PAGE INTRO — says what this screen is at a glance. */}
      <div className="page-head dash-head">
        <h1 className="page-title">This month</h1>
        <p className="page-title-sub">
          {monthName(monthIndex)} {year} at a glance — your goal, follow-ups, and
          the numbers.
        </p>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      {/* HERO — the centerpiece: the month's revenue against the $10k goal. */}
      <div className="card goal-hero">
        <div className="goal-hero-top">
          <div className="goal-hero-label">{label}</div>
          <div className="goal-hero-target muted">Target {money(GOAL)}</div>
        </div>
        <div className="goal-hero-num green">{money(heroRevenue)}</div>
        <div className="goal-track">
          <div
            className={`goal-fill${overGoal ? ' goal-fill-win' : ''}`}
            style={{ width: `${meterReady ? barWidth : 0}%` }}
          />
          {!overGoal ? (
            <div
              className="goal-pace-marker"
              style={{ left: `${expectedPct}%` }}
              title="Where you'd be if you hit the goal at an even daily pace"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className="goal-caption muted">
          {money(revenue)} of {money(GOAL)} &middot;{' '}
          <span className="goal-pct">{Math.round(pct)}%</span>
          {overGoal ? ' — goal smashed' : ''}
        </div>
        {!overGoal ? (
          <div className="goal-legend muted">
            <span className="goal-legend-tick" aria-hidden="true" />
            The tick marks where you should be by today to stay on track.
          </div>
        ) : null}
        <div className="goal-pace">
          <span className="goal-days">
            {daysLeft} day{daysLeft === 1 ? '' : 's'} left
          </span>
          {overGoal ? (
            <span className="goal-pace-tag green">Goal smashed</span>
          ) : (
            <>
              <span className="goal-need muted">
                Need {money(perDay)}/day
              </span>
              <span className={`goal-pace-tag ${onPace ? 'green' : 'red'}`}>
                {onPace ? 'On pace' : 'Behind pace'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* TODAY — the action center. One prioritized list of real next-actions,
          each with a one-tap action. Overdue first, then due today, then the
          scouting nudge. When nothing is due, a calm all-caught-up state. */}
      <div className="card today-card">
        <div className="today-head">
          <div className="card-label">
            Today
            {todayItems.length > 0
              ? ` — ${todayItems.length} thing${
                  todayItems.length === 1 ? '' : 's'
                } need${todayItems.length === 1 ? 's' : ''} you`
              : ''}
          </div>
        </div>

        {todayItems.length === 0 ? (
          <div className="today-clear">
            <div className="today-clear-line">You&rsquo;re all caught up.</div>
            <div className="muted today-clear-sub">
              No follow-ups due, stock looks good. Go find the next one.
            </div>
            <Link className="btn btn-primary today-clear-btn" href="/places">
              Find prospects
            </Link>
          </div>
        ) : (
          <div className="today-list">
            {todayItems.map((it) => {
              // FOLLOW-UP (client) and PROSPECT share the call + quote layout.
              if (it.kind === 'followup' || it.kind === 'prospect') {
                return (
                  <div className="today-item" key={it.key}>
                    <div className="today-item-main">
                      <div className="today-item-top">
                        {it.kind === 'followup' ? (
                          <Link
                            className="today-name today-name-link"
                            href={it.clientHref}
                          >
                            {it.name}
                          </Link>
                        ) : (
                          <span className="today-name">{it.name}</span>
                        )}
                        {it.kind === 'followup' && it.stage ? (
                          <span className={`chip chip-${it.stage}`}>
                            {stageLabel(it.stage)}
                          </span>
                        ) : (
                          <span className="today-tag">Prospect</span>
                        )}
                      </div>
                      <div
                        className={`today-due ${
                          it.overdue ? 'red' : 'muted'
                        }`}
                      >
                        {it.overdue ? 'Overdue' : 'Due today'} &middot;{' '}
                        {shortDate(it.due)}
                      </div>
                    </div>
                    <div className="today-actions">
                      {it.tel ? (
                        <a
                          className="today-btn today-btn-call"
                          href={it.tel}
                          aria-label={`Call ${it.name}`}
                        >
                          Call
                        </a>
                      ) : (
                        <span
                          className="today-nophone muted"
                          title="No phone number on file"
                        >
                          No number
                        </span>
                      )}
                      <Link className="today-btn today-btn-quote" href={it.quote}>
                        Quote
                      </Link>
                    </div>
                  </div>
                );
              }

              // LOW STOCK — reorder in a new tab.
              if (it.kind === 'stock') {
                return (
                  <div className="today-item" key={it.key}>
                    <div className="today-item-main">
                      <div className="today-item-top">
                        <span className="today-name">{it.name}</span>
                        <span className="today-tag today-tag-stock">
                          Low stock
                        </span>
                      </div>
                      <div className="today-due red">
                        {it.qty} left &middot; time to reorder
                      </div>
                    </div>
                    <div className="today-actions">
                      {it.reorderUrl ? (
                        <a
                          className="today-btn today-btn-quote"
                          href={it.reorderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Reorder
                        </a>
                      ) : (
                        <Link
                          className="today-btn today-btn-quote"
                          href="/inventory"
                        >
                          Inventory
                        </Link>
                      )}
                    </div>
                  </div>
                );
              }

              // SCOUTING NUDGE — prospects still queued to visit.
              return (
                <Link className="today-item today-item-link" key={it.key} href="/places">
                  <div className="today-item-main">
                    <div className="today-item-top">
                      <span className="today-name">
                        {it.count} place{it.count === 1 ? '' : 's'} to visit
                      </span>
                      <span className="today-tag today-tag-visit">Nudge</span>
                    </div>
                    <div className="today-due muted">
                      Go scout leads on the map
                    </div>
                  </div>
                  <div className="today-actions">
                    <span className="today-btn today-btn-ghost">Open</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* STAT TILES - compact 2x2 grid on phones, 4-across on wide. Each tile
          is a tappable shortcut: money tiles jump to /money, the recurring
          tile to /recurring. The link is a bare wrapper (no restyle) so the
          tile keeps its exact look and its no-layout-shift animations. */}
      <div className="stat-grid">
        <Link className="stat-tile-link" href="/money">
          <div className="stat-tile">
            <div className="stat-tile-label">Revenue</div>
            <div className="stat-tile-value green">{money(revenue)}</div>
          </div>
        </Link>
        <Link className="stat-tile-link" href="/money">
          <div className="stat-tile">
            <div className="stat-tile-label">Expenses</div>
            <div className="stat-tile-value red">{money(expenseTotal)}</div>
          </div>
        </Link>
        <Link className="stat-tile-link" href="/money">
          <div className="stat-tile">
            <div className="stat-tile-label">Profit</div>
            <div className={`stat-tile-value ${profit >= 0 ? 'green' : 'red'}`}>
              {money(profit)}
            </div>
          </div>
        </Link>
        <Link className="stat-tile-link" href="/recurring">
          <div className="stat-tile">
            <div className="stat-tile-label">Recurring / mo</div>
            <div className="stat-tile-value green">{money(mrr)}</div>
          </div>
        </Link>
      </div>

      {/* PRINT QUEUE - WAITING — whole card is a shortcut to /inventory. */}
      {printWaiting.length > 0 ? (
        <Link className="card-link" href="/inventory">
          <div className="card">
            <div className="card-label">Print queue — waiting</div>
            <div className="print-waiting-list">
              {printWaiting.map((job) => (
                <div className="list-item print-waiting-row" key={job.id}>
                  <span className="print-waiting-item">
                    {itemLabel(job.item)}
                  </span>
                  <span className="muted">{job.client || 'No client'}</span>
                </div>
              ))}
            </div>
          </div>
        </Link>
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

      {/* WORKFLOW STRIP — a quiet map of the business loop. Each step links to
          its tab, so the whole flow (scout -> price -> close -> make -> track)
          is one glanceable, tappable row. Small on purpose. */}
      <nav className="flow-strip" aria-label="How TagBooks works">
        <Link className="flow-step" href="/places">
          <span className="flow-step-label">Places</span>
          <span className="flow-step-cap muted">scout</span>
        </Link>
        <span className="flow-arrow" aria-hidden="true">&rsaquo;</span>
        <Link className="flow-step" href="/quote">
          <span className="flow-step-label">Quote</span>
          <span className="flow-step-cap muted">price</span>
        </Link>
        <span className="flow-arrow" aria-hidden="true">&rsaquo;</span>
        <Link className="flow-step" href="/clients">
          <span className="flow-step-label">Clients</span>
          <span className="flow-step-cap muted">close</span>
        </Link>
        <span className="flow-arrow" aria-hidden="true">&rsaquo;</span>
        <Link className="flow-step" href="/coins">
          <span className="flow-step-label">Coins</span>
          <span className="flow-step-cap muted">make</span>
        </Link>
        <span className="flow-arrow" aria-hidden="true">&rsaquo;</span>
        <Link className="flow-step" href="/money">
          <span className="flow-step-label">Money</span>
          <span className="flow-step-cap muted">track</span>
        </Link>
      </nav>

      {/* LATEST ACTIVITY */}
      <div className="card">
        <div className="card-label">Latest activity</div>
        {feed.length === 0 ? (
          <div className="muted empty-note">
            Nothing logged yet. Add a sale or expense on the Money page and it
            shows up here.
          </div>
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
