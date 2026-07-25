'use client';

// The Thank-You Stub — a wallet-pass / ticket-stub landing page a customer sees
// after tapping an NFC coin. It drives them to leave a Google review.
//
// COMPLIANCE — honored throughout this file: NO review gating. The Google
// review CTA (the dock button AND the star row) is shown to EVERY visitor
// unconditionally — never behind a rating, a tap, or any branch. The private
// "tell the owner" link is a low-emphasis sibling offered alongside the review
// CTA; it is never a gate, never conditioned on a star rating, and there is NO
// star-rating INPUT anywhere that could branch a low rating away from Google.

import { useState } from 'react';
import { proofFloor } from '../../../lib/reviewPages';
import { supabase } from '../../../lib/supabase';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const DEFAULT_NOTE =
  'Thanks for stopping by — a quick review keeps a small Calgary shop going.';

// ---- inline SVG icons (duotone, currentColor drives the accent) ----

function StarSVG({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.06 1.1-6.46-4.7-4.58 6.5-.94L12 2.5z"
      />
    </svg>
  );
}

function HubIcon({ kind }) {
  // Small duotone glyphs. The fill uses currentColor (accent); a lighter
  // secondary shape uses fill-opacity for depth.
  const paths = {
    call: (
      <path
        fill="currentColor"
        d="M6.6 2.9c.5 0 .95.34 1.1.83l1 3.2a1.2 1.2 0 0 1-.3 1.2L7 9.5a12 12 0 0 0 5.5 5.5l1.37-1.4c.32-.32.8-.43 1.2-.3l3.2 1c.5.16.83.6.83 1.1v3.1c0 .68-.55 1.2-1.23 1.16C9.6 20.9 3.1 14.4 2.6 5.3 2.55 4.65 3.07 4.1 3.75 4.1H6.6z"
      />
    ),
    directions: (
      <path
        fill="currentColor"
        d="M21.4 11.4l-8.8-8.8a1.2 1.2 0 0 0-1.7 0l-8.8 8.8a1.2 1.2 0 0 0 0 1.7l8.8 8.8c.47.47 1.23.47 1.7 0l8.8-8.8a1.2 1.2 0 0 0 0-1.7zm-8 1.3v-2H9.5v2.7H7.8V9.9c0-.5.4-.9.9-.9h4.7V7l3 2.85-3 2.85z"
      />
    ),
    menu: (
      <path
        fill="currentColor"
        d="M5 3h11a2 2 0 0 1 2 2v16l-4-2.2L10 21l-5-2V3zm2.5 4v2h9V7h-9zm0 4v2h9v-2h-9z"
      />
    ),
    website: (
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.3-3.3A8 8 0 0 1 18.9 8zM12 4.2c.8 1 1.5 2.3 1.9 3.8h-3.8c.4-1.5 1.1-2.8 1.9-3.8zM4.3 14a8 8 0 0 1 0-4h3.3a17.5 17.5 0 0 0 0 4H4.3zm.8 2h2.9c.34 1.2.78 2.3 1.3 3.3A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.2-3.3C8.8 5.7 8.36 6.8 8 8zm4 11.8c-.8-1-1.5-2.3-1.9-3.8h3.8c-.4 1.5-1.1 2.8-1.9 3.8zm2.3-5.8H9.7a15.4 15.4 0 0 1 0-4h4.6a15.4 15.4 0 0 1 0 4zm.4 5.3c.52-1 .96-2.1 1.3-3.3h2.9a8 8 0 0 1-4.2 3.3zM16.4 14a17.5 17.5 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z"
      />
    ),
    instagram: (
      <path
        fill="currentColor"
        d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm4.5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm5.3-3.3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"
      />
    ),
    facebook: (
      <path
        fill="currentColor"
        d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5H17V4.6c-.3-.04-1.3-.13-2.47-.13-2.45 0-4.13 1.5-4.13 4.25v2.37H7.6V14h2.8v8h3.1z"
      />
    ),
    custom: (
      <path
        fill="currentColor"
        d="M10.6 13.4a4 4 0 0 0 6 .4l2.5-2.5a4 4 0 0 0-5.6-5.6l-1.4 1.4 1.4 1.4 1.4-1.4a2 2 0 0 1 2.8 2.8l-2.5 2.5a2 2 0 0 1-3 0l-1.4 1.4zm2.8-2.8a4 4 0 0 0-6-.4l-2.5 2.5a4 4 0 0 0 5.6 5.6l1.4-1.4-1.4-1.4-1.4 1.4a2 2 0 0 1-2.8-2.8l2.5-2.5a2 2 0 0 1 3 0l1.4-1.4z"
      />
    ),
  };
  return (
    <svg className="rt-hub-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[kind] || paths.custom}
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="rt-chev" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6l6 6-6 6"
      />
    </svg>
  );
}

// Build the href for a hub link, deriving directions from the address when the
// row has no explicit url.
function hubHref(link, page) {
  if (link.url) return link.url;
  if (link.kind === 'directions' && page.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      page.address
    )}`;
  }
  return null;
}

export default function ReviewTapClient({ page }) {
  const [hoursOpen, setHoursOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const accent = page.accent_color || '#2456e6';
  const note = page.tagline || DEFAULT_NOTE;
  const reviewUrl = page.google_review_url || null;

  const proof = proofFloor(page.proofCount);

  const links = (Array.isArray(page.links) ? page.links : [])
    .map((l) => ({ ...l, href: hubHref(l, page) }))
    .filter((l) => l.href)
    .slice(0, 6);

  const monogram = (page.business_name || '?').trim().charAt(0).toUpperCase();

  // Today's hours (hours is { mon:[open,close], ..., sun:null }).
  const hours = page.hours && typeof page.hours === 'object' ? page.hours : null;
  const todayKey = DAY_KEYS[new Date().getDay()];
  const todayRange = hours ? hours[todayKey] : null;
  const todayLabel =
    Array.isArray(todayRange) && todayRange.length >= 2
      ? `${todayRange[0]}–${todayRange[1]}`
      : 'Closed';

  async function sendFeedback(e) {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from('review_page_feedback')
        .insert({ page_id: page.id, message: text, contact: contact.trim() || null });
      if (!error) {
        setSent(true);
        setMessage('');
        setContact('');
      }
    } catch {
      // fail quietly — never block the customer or surface a raw error.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rt-shell" style={{ '--rt-accent': accent }}>
      {/* 1. Accent band header */}
      <header className="rt-band">
        {page.logo_url ? (
          <img className="rt-logo" src={page.logo_url} alt="" width="56" height="56" />
        ) : (
          <span className="rt-monogram" aria-hidden="true">
            {monogram}
          </span>
        )}
        <h1 className="rt-name">{page.business_name}</h1>
        {page.tagline ? <p className="rt-tagline">{page.tagline}</p> : null}
      </header>

      {/* 2. Pass card */}
      <main className="rt-card">
        <p className="rt-note">{note}</p>

        {reviewUrl ? (
          <a
            className="rt-stars"
            href={reviewUrl}
            aria-label="Rate us on Google"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <StarSVG key={i} className={`rt-star rt-star-${i}`} />
            ))}
          </a>
        ) : (
          <div className="rt-stars rt-stars-static" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <StarSVG key={i} className={`rt-star rt-star-${i}`} />
            ))}
          </div>
        )}

        {proof != null ? (
          <p className="rt-proof">Join {proof}+ happy customers</p>
        ) : null}

        {/* 3. Perforated tear line */}
        <div className="rt-perf" aria-hidden="true" />

        {/* 4. Hub links */}
        {links.length ? (
          <nav className="rt-hub">
            {links.map((l, i) => (
              <a
                key={i}
                className="rt-hub-row"
                href={l.href}
                {...(/^https?:\/\//.test(l.href)
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <span className="rt-hub-ic">
                  <HubIcon kind={l.kind} />
                </span>
                <span className="rt-hub-label">{l.label}</span>
                <span className="rt-hub-chev">
                  <Chevron />
                </span>
              </a>
            ))}
          </nav>
        ) : null}

        {/* 5. Hours (optional) */}
        {hours ? (
          <div className="rt-hours">
            <button
              type="button"
              className="rt-hours-toggle"
              aria-expanded={hoursOpen}
              onClick={() => setHoursOpen((v) => !v)}
            >
              <span>
                Open today · <strong>{todayLabel}</strong>
              </span>
              <span className={`rt-hours-caret${hoursOpen ? ' open' : ''}`} aria-hidden="true">
                ▾
              </span>
            </button>
            {hoursOpen ? (
              <ul className="rt-hours-week">
                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k) => {
                  const r = hours[k];
                  const label =
                    Array.isArray(r) && r.length >= 2 ? `${r[0]}–${r[1]}` : 'Closed';
                  return (
                    <li
                      key={k}
                      className={`rt-hours-row${k === todayKey ? ' today' : ''}`}
                    >
                      <span>{DAY_LABELS[k]}</span>
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* 6. Footer */}
        <p className="rt-foot">Powered by Review Tap · a TagBooks product</p>
      </main>

      {/* 7. Fixed dock */}
      <div className="rt-dock">
        {reviewUrl ? (
          // SAME TAB on purpose — most reliable on iOS after an NFC tap.
          <a className="rt-dock-btn" href={reviewUrl}>
            Leave us a Google review
          </a>
        ) : null}

        {!feedbackOpen && !sent ? (
          <button
            type="button"
            className="rt-priv-link"
            onClick={() => setFeedbackOpen(true)}
          >
            Had a problem? Tell the owner privately
          </button>
        ) : null}

        {feedbackOpen && !sent ? (
          <form className="rt-priv-form" onSubmit={sendFeedback}>
            <textarea
              className="rt-priv-text"
              placeholder="Tell the owner what went wrong — this goes straight to them, not Google."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
            <input
              className="rt-priv-contact"
              type="text"
              placeholder="Your email or phone (optional)"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
            <div className="rt-priv-actions">
              <button
                type="button"
                className="rt-priv-cancel"
                onClick={() => setFeedbackOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rt-priv-send"
                disabled={sending || !message.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        ) : null}

        {sent ? <p className="rt-priv-sent">Thanks, sent.</p> : null}
      </div>
    </div>
  );
}
