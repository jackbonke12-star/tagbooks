'use client';

import { monthLabel } from '../lib/catalog';

// Prev/next month control. Parent owns { year, monthIndex } state and passes
// onChange(nextYear, nextMonthIndex).
export default function MonthSwitcher({ year, monthIndex, onChange }) {
  function shift(delta) {
    // Use a Date to roll year boundaries correctly, then read LOCAL parts.
    const d = new Date(year, monthIndex + delta, 1);
    onChange(d.getFullYear(), d.getMonth());
  }

  return (
    <div className="month-nav">
      <button
        type="button"
        className="btn btn-ghost"
        aria-label="Previous month"
        onClick={() => shift(-1)}
      >
        {'‹'}
      </button>
      <span className="month-nav-label">{monthLabel(year, monthIndex)}</span>
      <button
        type="button"
        className="btn btn-ghost"
        aria-label="Next month"
        onClick={() => shift(1)}
      >
        {'›'}
      </button>
    </div>
  );
}
