'use client';

import './review-site.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { qrSvg } from '../../lib/qr';
import ReviewBoostChecklist from '../../components/ReviewBoostChecklist';

// Build the public "Review Tap" URL for a slug. Uses the live origin so the
// copied link works from whatever host the app is served on.
function publicUrl(slug) {
  if (typeof window === 'undefined') return `/r/${slug}`;
  return `${window.location.origin}/r/${slug}`;
}

// Slugify a business name into a short url-safe base, then bolt on a short
// random suffix so two shops with the same name never collide.
function makeSlug(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : suffix;
}

const DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];

const LINK_KINDS = [
  ['call', 'Call'],
  ['directions', 'Directions'],
  ['menu', 'Menu'],
  ['website', 'Website'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['custom', 'Custom'],
];

const ACCENT_DEFAULT = '#2456e6';

// Short "Jul 2" style date for the feedback inbox.
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ReviewSitePage() {
  const [pages, setPages] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [previewSlug, setPreviewSlug] = useState('');

  const formTopRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [pagesRes, feedbackRes] = await Promise.all([
      supabase
        .from('review_pages')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('review_page_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    if (pagesRes.error) {
      setLoadError(pagesRes.error.message || 'Failed to load review pages.');
      setLoading(false);
      return;
    }
    setPages(pagesRes.data || []);
    setFeedback(feedbackRes.error ? [] : feedbackRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: pages edited or feedback submitted on any device refresh here.
  useRealtime(['review_pages', 'review_page_feedback'], load);

  const startEdit = useCallback((page) => {
    setEditing(page);
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const handleDelete = useCallback(
    async (page) => {
      if (
        !window.confirm(
          `Delete the review page for ${
            page.business_name || 'this business'
          }? This cannot be undone.`
        )
      )
        return;
      const { error } = await supabase
        .from('review_pages')
        .delete()
        .eq('id', page.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete review page.');
        return;
      }
      if (editing && editing.id === page.id) setEditing(null);
      load();
    },
    [editing, load]
  );

  // Map page_id -> business name for the feedback inbox labels.
  const pageNames = useMemo(() => {
    const m = {};
    for (const p of pages) m[p.id] = p.business_name;
    return m;
  }, [pages]);

  // The public URL the checklist card advertises: the page being edited if any,
  // else the most recently-created page.
  const selectedPublicUrl = useMemo(() => {
    const slug = editing?.slug || pages[0]?.slug || '';
    return slug ? publicUrl(slug) : '';
  }, [editing, pages]);

  return (
    <div className="review-site" ref={formTopRef}>
      <div className="page-head">
        <h1 className="page-title">Review Tap Pages</h1>
        <p className="page-title-sub">
          The branded page a customer lands on when they tap the NFC coin —
          hours, links, and a one-tap button to your Google review.
        </p>
      </div>

      <div className="rs-columns">
        <div className="rs-form-col">
          <PageForm
            key={editing ? editing.id : 'new'}
            editing={editing}
            onSaved={(slug) => {
              setEditing(null);
              setPreviewSlug(slug || '');
              load();
            }}
            onCancelEdit={cancelEdit}
            onSlugChange={setPreviewSlug}
          />
        </div>

        <LivePreview slug={previewSlug || editing?.slug || ''} />
      </div>

      <div className="card">
        <div className="card-label">Review pages</div>

        {loadError ? <div className="form-error">{loadError}</div> : null}

        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : pages.length === 0 ? (
          <div className="muted load-line">No review pages yet.</div>
        ) : (
          <div className="rs-list">
            {pages.map((page) => (
              <PageRow
                key={page.id}
                page={page}
                onEdit={() => startEdit(page)}
                onDelete={() => handleDelete(page)}
              />
            ))}
          </div>
        )}
      </div>

      <FeedbackInbox
        feedback={feedback}
        pageNames={pageNames}
        loading={loading}
      />

      <div className="card">
        <div className="card-label">Boost this page</div>
        <ReviewBoostChecklist url={selectedPublicUrl} />
      </div>
    </div>
  );
}

/* ---------------- Live preview ---------------- */

// A small phone-frame iframe of the public page. Only renders when a slug
// exists. On wide screens it sits beside the form; it stacks below on phones.
// The Refresh button bumps a nonce that remounts the iframe (e.g. after save).
function LivePreview({ slug }) {
  const [nonce, setNonce] = useState(0);
  if (!slug) return null;
  return (
    <div className="rs-preview-col">
      <div className="card rs-preview-card">
        <div className="rs-preview-head">
          <span className="card-label rs-preview-label">Live preview</span>
          <button
            type="button"
            className="rs-mini-btn"
            onClick={() => setNonce((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
        <div className="rs-phone">
          <iframe
            key={nonce}
            className="rs-phone-screen"
            title="Review page preview"
            src={`/r/${slug}`}
          />
        </div>
        <span className="rs-preview-hint muted">/r/{slug}</span>
      </div>
    </div>
  );
}

/* ---------------- Page row ---------------- */

function PageRow({ page, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const url = publicUrl(page.slug);
  const svg = useMemo(() => (showQr ? qrSvg(url) : null), [showQr, url]);

  const copy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked: fail quietly */
    }
  }, [url]);

  return (
    <div className="list-item rs-row">
      <div className="rs-main">
        <div className="rs-row-head">
          <span className="rs-name">{page.business_name}</span>
          {page.published ? (
            <span className="rs-stamp green">PUBLISHED</span>
          ) : (
            <span className="rs-stamp muted">DRAFT</span>
          )}
        </div>
        <div className="rs-link-row">
          <a
            className="rs-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            /r/{page.slug}
          </a>
          <button
            type="button"
            className={`rs-copy${copied ? ' copied' : ''}`}
            onClick={copy}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            className="rs-copy"
            onClick={() => setShowQr((v) => !v)}
          >
            {showQr ? 'Hide QR' : 'Show QR'}
          </button>
        </div>
        {showQr && svg ? (
          <div
            className="rs-qr"
            // qrSvg returns a trusted, self-built SVG string (no user HTML).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : null}
      </div>
      <div className="rs-actions">
        <button type="button" className="btn btn-ghost" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

/* ---------------- Feedback inbox ---------------- */

// Read-only inbox of private feedback left on the public pages (the "tell us
// privately" path). Quiet empty state.
function FeedbackInbox({ feedback, pageNames, loading }) {
  return (
    <div className="card">
      <div className="card-label">Feedback inbox</div>
      {loading ? (
        <div className="muted load-line">Loading…</div>
      ) : feedback.length === 0 ? (
        <div className="muted rs-empty">No feedback yet.</div>
      ) : (
        <div className="rs-feedback-list">
          {feedback.map((f) => (
            <div className="list-item rs-feedback" key={f.id}>
              <div className="rs-feedback-main">
                <span className="rs-feedback-msg">{f.message}</span>
                <span className="rs-feedback-meta muted">
                  {pageNames[f.page_id] || 'Unknown page'}
                  {f.contact ? ` · ${f.contact}` : ''}
                  {f.created_at ? ` · ${shortDate(f.created_at)}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Page form ---------------- */

// Normalize a 7-row hours editor into the stored json shape
// {"mon":["07:00","15:00"], ..., "sun":null}. Closed days become null.
function emptyHoursRows() {
  const rows = {};
  for (const [key] of DAYS) rows[key] = { closed: true, open: '', close: '' };
  return rows;
}

function hoursToRows(hours) {
  const rows = emptyHoursRows();
  if (hours && typeof hours === 'object') {
    for (const [key] of DAYS) {
      const val = hours[key];
      if (Array.isArray(val) && val.length === 2) {
        rows[key] = { closed: false, open: val[0] || '', close: val[1] || '' };
      } else {
        rows[key] = { closed: true, open: '', close: '' };
      }
    }
  }
  return rows;
}

function rowsToHours(rows) {
  const out = {};
  for (const [key] of DAYS) {
    const r = rows[key];
    out[key] = r && !r.closed ? [r.open || '', r.close || ''] : null;
  }
  return out;
}

function PageForm({ editing, onSaved, onCancelEdit, onSlugChange }) {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [reviewUrl, setReviewUrl] = useState('');
  const [tagline, setTagline] = useState('');
  const [accent, setAccent] = useState(ACCENT_DEFAULT);
  const [logoUrl, setLogoUrl] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [published, setPublished] = useState(false);
  const [hoursRows, setHoursRows] = useState(emptyHoursRows());
  const [links, setLinks] = useState([]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  // Load clients for the "Start from client" picker.
  useEffect(() => {
    let stale = false;
    (async () => {
      const { data, error: cErr } = await supabase
        .from('clients')
        .select(
          'id, business_name, phone, address, google_review_url, baseline_reviews'
        )
        .order('business_name', { ascending: true });
      if (stale || cErr) return;
      setClients(data || []);
    })();
    return () => {
      stale = true;
    };
  }, []);

  // Hydrate the form from the row being edited.
  useEffect(() => {
    if (editing) {
      setClientId(editing.client_id || '');
      setBusinessName(editing.business_name || '');
      setSlug(editing.slug || '');
      setSlugTouched(true);
      setReviewUrl(editing.google_review_url || '');
      setTagline(editing.tagline || '');
      setAccent(editing.accent_color || ACCENT_DEFAULT);
      setLogoUrl(editing.logo_url || '');
      setAddress(editing.address || '');
      setPhone(editing.phone || '');
      setSeoDescription(editing.seo_description || '');
      setPublished(!!editing.published);
      setHoursRows(hoursToRows(editing.hours));
      setLinks(Array.isArray(editing.links) ? editing.links : []);
      setError('');
    }
  }, [editing]);

  // Auto-generate the slug from the business name until the user edits it.
  useEffect(() => {
    if (isEdit || slugTouched) return;
    setSlug(businessName.trim() ? makeSlug(businessName) : '');
  }, [businessName, slugTouched, isEdit]);

  // Keep the live preview in sync with the current slug.
  useEffect(() => {
    if (onSlugChange) onSlugChange(slug.trim());
  }, [slug, onSlugChange]);

  // Selecting a client autofills the contact fields (all stay editable).
  function pickClient(id) {
    setClientId(id);
    if (!id) return;
    const c = clients.find((x) => String(x.id) === String(id));
    if (!c) return;
    setBusinessName(c.business_name || '');
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setReviewUrl(c.google_review_url || '');
  }

  function updateHour(key, patch) {
    setHoursRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function addLink() {
    setLinks((prev) => [...prev, { kind: 'website', label: '', url: '' }]);
  }

  function updateLink(i, patch) {
    setLinks((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );
  }

  function removeLink(i) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }
    const cleanSlug = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!cleanSlug) {
      setError('Link code (slug) is required.');
      return;
    }

    // Only keep links that carry a label or a url (kind alone is not a link).
    const cleanLinks = links
      .map((l) => ({
        kind: l.kind || 'custom',
        label: (l.label || '').trim(),
        url: (l.url || '').trim(),
      }))
      .filter((l) => l.label || l.url);

    setSaving(true);
    const payload = {
      client_id: clientId || null,
      slug: cleanSlug,
      business_name: businessName.trim(),
      google_review_url: reviewUrl.trim() ? reviewUrl.trim() : null,
      tagline: tagline.trim() ? tagline.trim() : null,
      accent_color: accent || ACCENT_DEFAULT,
      logo_url: logoUrl.trim() ? logoUrl.trim() : null,
      address: address.trim() ? address.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
      hours: rowsToHours(hoursRows),
      links: cleanLinks,
      seo_description: seoDescription.trim() ? seoDescription.trim() : null,
      published,
    };

    let res;
    if (isEdit) {
      res = await supabase
        .from('review_pages')
        .update(payload)
        .eq('id', editing.id);
    } else {
      res = await supabase.from('review_pages').insert(payload);
    }

    setSaving(false);
    if (res.error) {
      const msg = res.error.message || 'Failed to save review page.';
      if (/duplicate|unique/i.test(msg)) {
        setError('That link code is already taken — try another.');
      } else {
        setError(msg);
      }
      return;
    }

    onSaved(cleanSlug);
  }

  const seoLen = seoDescription.length;

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">
        {isEdit ? 'Edit review page' : 'New review page'}
      </div>

      {!isEdit ? (
        <div className="field">
          <label className="label">Start from client</label>
          <select
            className="select"
            value={clientId}
            onChange={(e) => pickClient(e.target.value)}
          >
            <option value="">— standalone —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </select>
          <span className="rs-hint muted">
            Picks up the client&apos;s name, phone, address, and review URL —
            all still editable below.
          </span>
        </div>
      ) : null}

      <div className="grid2">
        <div className="field">
          <label className="label">Business name</label>
          <input
            type="text"
            className="input"
            value={businessName}
            placeholder="Business name"
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Link code</label>
          <input
            type="text"
            className="input"
            value={slug}
            placeholder="auto-generated"
            autoComplete="off"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
          <span className="rs-hint muted">Public page: /r/{slug || '…'}</span>
        </div>
      </div>

      <div className="field">
        <label className="label">Google review URL</label>
        <input
          type="url"
          className="input"
          value={reviewUrl}
          inputMode="url"
          placeholder="https://g.page/r/... (where the review button sends them)"
          onChange={(e) => setReviewUrl(e.target.value)}
        />
        {!reviewUrl.trim() ? (
          <span className="rs-warn">
            No review URL = no review button on the page.
          </span>
        ) : null}
      </div>

      <div className="field">
        <label className="label">Tagline / thank-you note</label>
        <textarea
          className="textarea"
          value={tagline}
          placeholder="Thanks for stopping by — a quick review means the world to us."
          onChange={(e) => setTagline(e.target.value)}
        />
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label">Accent color</label>
          <div className="rs-color">
            <input
              type="color"
              className="rs-swatch"
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : ACCENT_DEFAULT}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Accent color"
            />
            <input
              type="text"
              className="input rs-hex"
              value={accent}
              placeholder="#2456e6"
              autoComplete="off"
              onChange={(e) => setAccent(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="label">Logo URL (optional)</label>
          <input
            type="url"
            className="input"
            value={logoUrl}
            inputMode="url"
            placeholder="https://…/logo.png"
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label">Address</label>
          <input
            type="text"
            className="input"
            value={address}
            placeholder="Optional"
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Phone</label>
          <input
            type="tel"
            className="input"
            value={phone}
            placeholder="Optional"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="label">
          SEO description
          <span className={`rs-counter${seoLen > 155 ? ' over' : ''}`}>
            {seoLen}/155
          </span>
        </label>
        <textarea
          className="textarea rs-seo"
          value={seoDescription}
          placeholder="One sentence for search engines and link previews."
          onChange={(e) => setSeoDescription(e.target.value)}
        />
      </div>

      {/* Hours editor */}
      <div className="field">
        <label className="label">Opening hours</label>
        <div className="rs-hours">
          {DAYS.map(([key, label]) => {
            const r = hoursRows[key];
            return (
              <div className="rs-hour-row" key={key}>
                <span className="rs-hour-day">{label}</span>
                <label className="rs-hour-closed">
                  <input
                    type="checkbox"
                    checked={r.closed}
                    onChange={(e) =>
                      updateHour(key, { closed: e.target.checked })
                    }
                  />
                  Closed
                </label>
                <input
                  type="time"
                  className="input rs-time"
                  value={r.open}
                  disabled={r.closed}
                  onChange={(e) => updateHour(key, { open: e.target.value })}
                />
                <span className="rs-hour-dash muted">–</span>
                <input
                  type="time"
                  className="input rs-time"
                  value={r.close}
                  disabled={r.closed}
                  onChange={(e) => updateHour(key, { close: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Links editor */}
      <div className="field">
        <label className="label">Action links</label>
        <div className="rs-links">
          {links.length === 0 ? (
            <span className="rs-hint muted">No links yet.</span>
          ) : null}
          {links.map((l, i) => (
            <div className="rs-link-edit" key={i}>
              <select
                className="select rs-link-kind"
                value={l.kind || 'custom'}
                onChange={(e) => updateLink(i, { kind: e.target.value })}
              >
                {LINK_KINDS.map(([val, lab]) => (
                  <option key={val} value={val}>
                    {lab}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="input rs-link-label"
                value={l.label || ''}
                placeholder="Label"
                onChange={(e) => updateLink(i, { label: e.target.value })}
              />
              <input
                type="text"
                className="input rs-link-url"
                value={l.url || ''}
                placeholder={
                  l.kind === 'call' || l.kind === 'directions'
                    ? 'Leave blank to auto-derive'
                    : 'https://…'
                }
                onChange={(e) => updateLink(i, { url: e.target.value })}
              />
              <button
                type="button"
                className="rs-mini-btn rs-link-remove"
                onClick={() => removeLink(i)}
                aria-label="Remove link"
              >
                Remove
              </button>
              {(l.kind === 'call' || l.kind === 'directions') && !l.url ? (
                <span className="rs-hint muted rs-link-note">
                  {l.kind === 'call'
                    ? 'tel: derived from the phone above.'
                    : 'Maps link derived from the address above.'}
                </span>
              ) : null}
            </div>
          ))}
          <button type="button" className="rs-mini-btn" onClick={addLink}>
            + Add link
          </button>
        </div>
      </div>

      {/* Published state */}
      <div className="field">
        <label className="label">Status</label>
        <div className="seg">
          <button
            type="button"
            className={!published ? 'on' : ''}
            onClick={() => setPublished(false)}
          >
            Draft
          </button>
          <button
            type="button"
            className={published ? 'on' : ''}
            onClick={() => setPublished(true)}
          >
            Published
          </button>
        </div>
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create page'}
        </button>
      </div>
    </form>
  );
}
