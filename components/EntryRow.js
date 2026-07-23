'use client';

import { money, productLabel, categoryLabel, shortDate } from '../lib/catalog';

// Capitalize a partner key ("jack" -> "Jack").
function partnerName(key) {
  if (!key) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// A single feed/table row for a sale or expense entry.
// entry: a normalized object with a `kind` of 'sale' | 'expense'.
// When onEdit/onDelete are provided, action buttons are shown.
export default function EntryRow({ entry, onEdit, onDelete }) {
  const isSale = entry.kind === 'sale';

  const title = isSale
    ? entry.client_name || 'Sale'
    : categoryLabel(entry.category);

  const subtitle = isSale
    ? productLabel(entry.product)
    : [entry.vendor, entry.notes].filter(Boolean).join(' · ');

  const who = isSale ? entry.closed_by : entry.paid_by;
  const amountClass = isSale ? 'green' : 'red';
  const amountText = `${isSale ? '+' : '-'}${money(entry.amount)}`;

  return (
    <div className="list-item">
      <div className="entry-main">
        <div className="entry-head">
          <span className="entry-title">{title}</span>
          {who ? <span className="entry-tag">{partnerName(who)}</span> : null}
        </div>
        {subtitle ? <div className="entry-sub muted">{subtitle}</div> : null}
        <div className="entry-date muted">{shortDate(entry.date)}</div>
      </div>

      <div className="entry-right">
        <span className={`entry-amount ${amountClass}`}>{amountText}</span>
        {(onEdit || onDelete) && (
          <div className="entry-actions">
            {onEdit && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onEdit(entry)}
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => onDelete(entry)}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
