'use client';

import './clients.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { STAGES, stageLabel, localToday, shortDate } from '../../lib/catalog';

// Build a tel: href by stripping everything except digits, then add a
// leading +1 for US dialing. Display keeps the phone exactly as entered.
function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `tel:+1${digits}`;
}

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | stage value
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const formTopRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('next_followup', { ascending: true, nullsFirst: false })
      .order('business_name', { ascending: true });
    if (error) {
      setLoadError(error.message || 'Failed to load clients.');
      setLoading(false);
      return;
    }
    setClients(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when clients change on any device.
  useRealtime(['clients'], load);

  const startEdit = useCallback((client) => {
    setEditing(client);
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const handleDelete = useCallback(
    async (client) => {
      if (
        !window.confirm(
          `Delete ${client.business_name || 'this client'}? This cannot be undone.`
        )
      )
        return;
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete client.');
        return;
      }
      if (editing && editing.id === client.id) setEditing(null);
      load();
    },
    [editing, load]
  );

  // Counts per stage for the filter labels.
  const counts = useMemo(() => {
    const c = { all: clients.length };
    for (const s of STAGES) c[s.value] = 0;
    for (const client of clients) {
      if (c[client.stage] !== undefined) c[client.stage] += 1;
    }
    return c;
  }, [clients]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter !== 'all' && c.stage !== filter) return false;
      if (!q) return true;
      const hay = `${c.business_name || ''} ${c.contact_name || ''} ${
        c.phone || ''
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [clients, filter, search]);

  const today = localToday();

  return (
    <div className="clients" ref={formTopRef}>
      <ClientForm
        editing={editing}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onCancelEdit={cancelEdit}
      />

      {/* Stage filter */}
      <div className="seg stage-filter">
        <button
          type="button"
          className={filter === 'all' ? 'on' : ''}
          onClick={() => setFilter('all')}
        >
          All {counts.all}
        </button>
        {STAGES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={filter === s.value ? 'on' : ''}
            onClick={() => setFilter(s.value)}
          >
            {s.label} {counts[s.value]}
          </button>
        ))}
      </div>

      {/* Client list */}
      <div className="card">
        <div className="card-label">Clients</div>

        {/* Search: filters the already-loaded list client-side. */}
        <div className="field client-search">
          <input
            type="search"
            className="input"
            value={search}
            placeholder="Search name, contact, or phone"
            inputMode="search"
            autoComplete="off"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() ? (
            <button
              type="button"
              className="client-search-clear"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              Clear
            </button>
          ) : null}
        </div>

        {!loading && !loadError ? (
          <div className="client-count muted">
            {visible.length === 1
              ? '1 client'
              : `${visible.length} clients`}
            {search.trim() || filter !== 'all'
              ? ` of ${clients.length}`
              : ''}
          </div>
        ) : null}

        {loadError ? <div className="form-error">{loadError}</div> : null}
        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="muted load-line">
            {search.trim() || filter !== 'all'
              ? 'No matches.'
              : 'No clients here yet.'}
          </div>
        ) : (
          <div className="client-list">
            {visible.map((client) => {
              const tel = telHref(client.phone);
              const due =
                client.next_followup && client.next_followup <= today;
              return (
                <div className="list-item client-row" key={client.id}>
                  <div className="client-main">
                    <span className="client-name">{client.business_name}</span>
                    <span className={`chip chip-${client.stage}`}>
                      {stageLabel(client.stage)}
                    </span>
                    {client.contact_name ? (
                      <span className="client-sub">{client.contact_name}</span>
                    ) : null}
                    {client.phone ? (
                      tel ? (
                        <a className="client-sub client-tel" href={tel}>
                          {client.phone}
                        </a>
                      ) : (
                        <span className="client-sub">{client.phone}</span>
                      )
                    ) : null}
                    {client.google_review_url ? (
                      <span className="review-row">
                        <a
                          className="review-link"
                          href={client.google_review_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Review link
                        </a>
                        <CopyLinkButton url={client.google_review_url} />
                        <Link className="review-qr" href="/coins">
                          QR
                        </Link>
                      </span>
                    ) : null}
                  </div>
                  <div className="client-meta">
                    {client.next_followup ? (
                      <span
                        className={`client-followup${due ? ' red' : ''}`}
                      >
                        {shortDate(client.next_followup)}
                      </span>
                    ) : null}
                    <div className="client-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => startEdit(client)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(client)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Copy-link button ---------------- */

// Copies a URL to the clipboard, flashing a brief "Copied" state (~1.5s).
// Guards against undefined URLs and clipboards that aren't available.
function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    if (!url) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        return;
      }
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className={`review-copy${copied ? ' copied' : ''}`}
      onClick={copy}
      aria-label="Copy review link"
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

/* ---------------- Client form ---------------- */

function ClientForm({ editing, onSaved, onCancelEdit }) {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [stage, setStage] = useState('lead');
  const [nextFollowup, setNextFollowup] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Pull-from-Places: search the prospects table and autofill from a pick.
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeResults, setPlaceResults] = useState([]);
  const [placesOpen, setPlacesOpen] = useState(false);

  const isEdit = !!editing;

  // Debounced prospects search: only query when the term is >= 2 chars. A
  // stale flag keeps out-of-order responses from overwriting fresher results.
  useEffect(() => {
    const term = placeSearch.trim();
    if (term.length < 2) {
      setPlaceResults([]);
      setPlacesOpen(false);
      return undefined;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from('prospects')
        .select()
        .ilike('name', `%${term}%`)
        .limit(8);
      if (stale) return;
      if (searchError) {
        setPlaceResults([]);
        setPlacesOpen(false);
        return;
      }
      setPlaceResults(data || []);
      setPlacesOpen(true);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [placeSearch]);

  // Autofill the client fields from a picked prospect. business_type + city go
  // into notes only when notes is currently empty.
  function pickPlace(place) {
    setBusinessName(place.name || '');
    setPhone(place.phone || '');
    setAddress(place.address || '');
    setGoogleReviewUrl(place.google_review_url || '');
    if (!notes.trim()) {
      const summary = [place.business_type, place.city]
        .filter(Boolean)
        .join(' - ');
      if (summary) setNotes(summary);
    }
    setPlaceSearch('');
    setPlaceResults([]);
    setPlacesOpen(false);
  }

  useEffect(() => {
    if (editing) {
      setBusinessName(editing.business_name || '');
      setContactName(editing.contact_name || '');
      setPhone(editing.phone || '');
      setAddress(editing.address || '');
      setStage(editing.stage || 'lead');
      setNextFollowup(editing.next_followup || '');
      setGoogleReviewUrl(editing.google_review_url || '');
      setNotes(editing.notes || '');
      setError('');
    }
  }, [editing]);

  function resetForm() {
    setBusinessName('');
    setContactName('');
    setPhone('');
    setAddress('');
    setStage('lead');
    setNextFollowup('');
    setGoogleReviewUrl('');
    setNotes('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }

    setSaving(true);
    const payload = {
      business_name: businessName.trim(),
      contact_name: contactName.trim() ? contactName.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
      address: address.trim() ? address.trim() : null,
      stage,
      next_followup: nextFollowup || null,
      google_review_url: googleReviewUrl.trim() ? googleReviewUrl.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    let res;
    if (isEdit) {
      res = await supabase.from('clients').update(payload).eq('id', editing.id);
    } else {
      res = await supabase.from('clients').insert(payload);
    }

    setSaving(false);
    if (res.error) {
      setError(res.error.message || 'Failed to save client.');
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
      <div className="card-label">{isEdit ? 'Edit client' : 'New client'}</div>

      {!isEdit ? (
        <div className="field place-pull">
          <label className="label">Pull from Places</label>
          <input
            type="text"
            className="input"
            value={placeSearch}
            placeholder="Search a scouted business to autofill"
            autoComplete="off"
            onChange={(e) => setPlaceSearch(e.target.value)}
            onFocus={() => {
              if (placeResults.length) setPlacesOpen(true);
            }}
          />
          {placesOpen && placeResults.length ? (
            <div className="place-pull-list">
              {placeResults.map((p) => {
                const sub = [p.business_type, p.city]
                  .filter(Boolean)
                  .join(' - ');
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="place-pull-item"
                    onClick={() => pickPlace(p)}
                  >
                    <span className="place-pull-name">{p.name}</span>
                    {sub ? (
                      <span className="place-pull-sub">{sub}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
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
          <label className="label">Contact name</label>
          <input
            type="text"
            className="input"
            value={contactName}
            placeholder="Optional"
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
      </div>

      <div className="grid2">
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
        <div className="field">
          <label className="label">Next follow-up</label>
          <input
            type="date"
            className="input"
            value={nextFollowup}
            onChange={(e) => setNextFollowup(e.target.value)}
          />
        </div>
      </div>

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
        <label className="label">Google review link</label>
        <input
          type="url"
          className="input"
          value={googleReviewUrl}
          inputMode="url"
          placeholder="https://g.page/r/... (optional)"
          onChange={(e) => setGoogleReviewUrl(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Stage</label>
        <div className="seg">
          {STAGES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={stage === s.value ? 'on' : ''}
              onClick={() => setStage(s.value)}
            >
              {s.label}
            </button>
          ))}
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add client'}
        </button>
      </div>
    </form>
  );
}
