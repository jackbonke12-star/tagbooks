'use client';

import { useMemo } from 'react';
import { money, ymd } from '../lib/catalog';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Traditional month calendar grid (Sun-Sat, weeks as rows) for the selected
// month. Each day cell shows the day number and a compact income/expense
// summary when that day has activity. Clicking a day selects it (parent owns
// the selected-day filter). Dates are all handled in LOCAL time via ymd().
export default function MoneyCalendar({
  year,
  monthIndex,
  sales,
  expenses,
  selectedDay,
  onSelectDay,
}) {
  // Per-day rollups keyed by YYYY-MM-DD: { income, expense }.
  const byDay = useMemo(() => {
    const map = new Map();
    const add = (dateStr, field, amt) => {
      if (!dateStr) return;
      const cur = map.get(dateStr) || { income: 0, expense: 0 };
      cur[field] += Number(amt || 0);
      map.set(dateStr, cur);
    };
    for (const s of sales) add(s.date, 'income', s.amount);
    for (const e of expenses) add(e.date, 'expense', e.amount);
    return map;
  }, [sales, expenses]);

  // Build the grid of weeks. Lead with blanks for the weekday the 1st lands on,
  // and trail with blanks so the final week row is always full (7 cells).
  const weeks = useMemo(() => {
    const firstDow = new Date(year, monthIndex, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(ymd(new Date(year, monthIndex, d)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [year, monthIndex]);

  const todayStr = ymd(new Date());

  return (
    <div className="cal">
      <div className="cal-grid cal-head" role="row">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday" role="columnheader">
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="cal-grid" role="row">
          {week.map((dateStr, ci) => {
            if (!dateStr) {
              return <div key={ci} className="cal-cell cal-cell-empty" aria-hidden="true" />;
            }
            const day = Number(dateStr.slice(8, 10));
            const info = byDay.get(dateStr);
            const isSelected = selectedDay === dateStr;
            const isToday = dateStr === todayStr;
            const classes = ['cal-cell'];
            if (isSelected) classes.push('on');
            if (isToday) classes.push('today');
            if (info) classes.push('has-activity');
            return (
              <button
                key={ci}
                type="button"
                className={classes.join(' ')}
                aria-pressed={isSelected}
                aria-label={`Day ${day}${info ? ', has activity' : ''}`}
                onClick={() => onSelectDay(isSelected ? null : dateStr)}
              >
                <span className="cal-day-num">{day}</span>
                {info ? (
                  <span className="cal-day-sums">
                    {info.income > 0 ? (
                      <span className="cal-sum green" title="Income">
                        {money(info.income)}
                      </span>
                    ) : null}
                    {info.expense > 0 ? (
                      <span className="cal-sum red" title="Expenses">
                        {money(-info.expense)}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
