'use client';

import './wifi.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { qrSvg } from '../../lib/qr';

// Build the public share URL for a gate slug. Uses the live origin so the copied
// link works from whatever host the app is served on (Vercel, localhost, etc.).
function publicUrl(slug) {
  if (typeof window === 'undefined') return `/w/${slug}`;
  return `${window.location.origin}/w/${slug}`;
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

export default function WifiPage() {
  const [gates, setGates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);

  const formTopRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('wifi_gates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(error.message || 'Failed to load WiFi gates.');
      setLoading(false);
      return;
    }
    setGates(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: gates added/edited on any device refresh here.
  useRealtime(['wifi_gates'], load);

  const startEdit = useCallback((gate) => {
    setEditing(gate);
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const handleDelete = useCallback(
    async (gate) => {
      if (
        !window.confirm(
          `Delete the WiFi gate for ${
            gate.business_name || 'this business'
          }? This cannot be undone.`
        )
      )
        return;
      const { error } = await supabase
        .from('wifi_gates')
        .delete()
        .eq('id', gate.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete gate.');
        return;
      }
      if (editing && editing.id === gate.id) setEditing(null);
      load();
    },
    [editing, load]
  );

  return (
    <div className="wifi" ref={formTopRef}>
      <GateForm
        editing={editing}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onCancelEdit={cancelEdit}
      />

      <div className="card">
        <div className="card-label">WiFi gates</div>
        <p className="wifi-intro muted">
          Each gate is a public page. The customer taps &ldquo;Leave a
          Review&rdquo; and the WiFi name and password are revealed.
        </p>

        {loadError ? <div className="form-error">{loadError}</div> : null}

        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : gates.length === 0 ? (
          <div className="muted load-line">No WiFi gates yet.</div>
        ) : (
          <div className="wifi-list">
            {gates.map((gate) => (
              <GateRow
                key={gate.id}
                gate={gate}
                onEdit={() => startEdit(gate)}
                onDelete={() => handleDelete(gate)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Gate row ---------------- */

function GateRow({ gate, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const url = publicUrl(gate.slug);
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
    <div className="list-item wifi-row">
      <div className="wifi-main">
        <span className="wifi-name">{gate.business_name}</span>
        <span className="wifi-net muted">
          {gate.wifi_ssid} · {gate.wifi_password}
        </span>
        <div className="wifi-link-row">
          <a
            className="wifi-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            /w/{gate.slug}
          </a>
          <button
            type="button"
            className={`wifi-copy${copied ? ' copied' : ''}`}
            onClick={copy}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            className="wifi-copy"
            onClick={() => setShowQr((v) => !v)}
          >
            {showQr ? 'Hide QR' : 'Show QR'}
          </button>
        </div>
        {showQr && svg ? (
          <div
            className="wifi-qr"
            // qrSvg returns a trusted, self-built SVG string (no user HTML).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : null}
      </div>
      <div className="wifi-actions">
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

/* ---------------- Gate form ---------------- */

function GateForm({ editing, onSaved, onCancelEdit }) {
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [reviewUrl, setReviewUrl] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  useEffect(() => {
    if (editing) {
      setBusinessName(editing.business_name || '');
      setSlug(editing.slug || '');
      setSlugTouched(true);
      setReviewUrl(editing.google_review_url || '');
      setSsid(editing.wifi_ssid || '');
      setPassword(editing.wifi_password || '');
      setNote(editing.note || '');
      setError('');
    }
  }, [editing]);

  // Auto-fill the slug from the business name until the user edits it directly.
  useEffect(() => {
    if (isEdit || slugTouched) return;
    setSlug(businessName.trim() ? makeSlug(businessName) : '');
  }, [businessName, slugTouched, isEdit]);

  function resetForm() {
    setBusinessName('');
    setSlug('');
    setSlugTouched(false);
    setReviewUrl('');
    setSsid('');
    setPassword('');
    setNote('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }
    if (!ssid.trim()) {
      setError('WiFi network name is required.');
      return;
    }
    if (!password.trim()) {
      setError('WiFi password is required.');
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

    setSaving(true);
    const payload = {
      slug: cleanSlug,
      business_name: businessName.trim(),
      google_review_url: reviewUrl.trim() ? reviewUrl.trim() : null,
      wifi_ssid: ssid.trim(),
      wifi_password: password.trim(),
      note: note.trim() ? note.trim() : null,
    };

    let res;
    if (isEdit) {
      res = await supabase
        .from('wifi_gates')
        .update(payload)
        .eq('id', editing.id);
    } else {
      res = await supabase.from('wifi_gates').insert(payload);
    }

    setSaving(false);
    if (res.error) {
      const msg = res.error.message || 'Failed to save gate.';
      // Unique-slug collisions surface as a friendlier hint.
      if (/duplicate|unique/i.test(msg)) {
        setError('That link code is already taken — try another.');
      } else {
        setError(msg);
      }
      return;
    }

    if (isEdit) {
      onSaved();
    } else {
      resetForm();
      onSaved();
    }
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-label">
        {isEdit ? 'Edit WiFi gate' : 'New WiFi gate'}
      </div>

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
          <span className="wifi-hint muted">Public page: /w/{slug || '…'}</span>
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label">WiFi network (SSID)</label>
          <input
            type="text"
            className="input"
            value={ssid}
            placeholder="e.g. ShopGuest"
            autoComplete="off"
            onChange={(e) => setSsid(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">WiFi password</label>
          <input
            type="text"
            className="input"
            value={password}
            placeholder="e.g. coffee123"
            autoComplete="off"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="label">Google review link</label>
        <input
          type="url"
          className="input"
          value={reviewUrl}
          inputMode="url"
          placeholder="https://g.page/r/... (where Leave a Review sends them)"
          onChange={(e) => setReviewUrl(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Note to customer</label>
        <input
          type="text"
          className="input"
          value={note}
          placeholder="Optional — e.g. Enjoy your visit!"
          onChange={(e) => setNote(e.target.value)}
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create gate'}
        </button>
      </div>
    </form>
  );
}
