'use client';

import './places.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';

// High-review target business types (datalist + quick-fill chips).
const BUSINESS_TYPES = [
  'Restaurant',
  'Cafe',
  'Coffee shop',
  'Bakery',
  'Hair salon',
  'Barbershop',
  'Nail salon',
  'Spa',
  'Auto repair',
  'Auto detailing',
  'Dentist',
  'Chiropractor',
  'Physiotherapy',
  'Gym / fitness studio',
  'Boutique',
  'Pet groomer',
  'Tattoo studio',
  'Cannabis store',
  'Dry cleaner',
  'Real estate agent',
  'Contractor / trades',
];

// A tasteful subset used for the tappable "target ideas" quick-fill row.
const TARGET_IDEAS = [
  'Restaurant',
  'Cafe',
  'Hair salon',
  'Barbershop',
  'Nail salon',
  'Spa',
  'Auto repair',
  'Dentist',
  'Tattoo studio',
];

// NW Calgary communities (datalist for the community/area field -> `city`).
const COMMUNITIES = [
  'Kensington',
  'Hillhurst',
  'Sunnyside',
  'Bowness',
  'Montgomery',
  'Varsity',
  'Brentwood',
  'Dalhousie',
  'Tuscany',
  'Crowfoot',
  'Ranchlands',
  'Silver Springs',
  'Hidden Valley',
  'Citadel',
  'Arbour Lake',
  'Royal Oak',
  'Rocky Ridge',
  'Edgemont',
  'Hamptons',
  'Sage Hill',
  'Evanston',
  'Kincora',
  'Nolan Hill',
  'Sherwood',
  'University District',
  'Charleswood',
  'Thorncliffe',
  'Huntington Hills',
  'Bearspaw',
];

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
];

// Status stamps. `to_visit` -> `visited` -> `pitched` -> `won` cycles; `skip`
// is set separately (edit form / small control), so it is not in the cycle.
const STATUS_LABELS = {
  to_visit: 'TO VISIT',
  visited: 'VISITED',
  pitched: 'PITCHED',
  won: 'WON',
  skip: 'SKIP',
};

// Next status when tapping the stamp (skip is excluded from the cycle).
const NEXT_STATUS = {
  to_visit: 'visited',
  visited: 'pitched',
  pitched: 'won',
  won: 'to_visit',
  skip: 'to_visit',
};

// Sort weights: high first, then medium, then low.
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
// Then by status in visit-flow order.
const STATUS_RANK = { to_visit: 0, visited: 1, pitched: 2, won: 3, skip: 4 };

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'to_visit', label: 'To visit' },
  { value: 'visited', label: 'Visited' },
  { value: 'pitched', label: 'Pitched' },
  { value: 'won', label: 'Won' },
];

function statusLabel(value) {
  return STATUS_LABELS[value] || 'TO VISIT';
}

// Build an Apple Maps navigation URL. Uses the address when present, otherwise
// falls back to "name, community, Calgary AB". URL-encoded either way.
function directionsHref(place) {
  const addr = (place.address || '').trim();
  const query = addr
    ? addr
    : `${place.name || ''}, ${place.city || ''}, Calgary AB`;
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

export default function PlacesPage() {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | status value
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [prefillType, setPrefillType] = useState('');

  const formTopRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.from('prospects').select('*');
    if (error) {
      setLoadError(error.message || 'Failed to load places.');
      setLoading(false);
      return;
    }
    setPlaces(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when prospects change on any device.
  useRealtime(['prospects'], load);

  const startEdit = useCallback((place) => {
    setEditing(place);
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  // Tapping a target-idea chip prefills the business_type field.
  const fillType = useCallback((type) => {
    setPrefillType(type);
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleDelete = useCallback(
    async (place) => {
      if (
        !window.confirm(
          `Delete ${place.name || 'this place'}? This cannot be undone.`
        )
      )
        return;
      const { error } = await supabase
        .from('prospects')
        .delete()
        .eq('id', place.id);
      if (error) {
        setLoadError(error.message || 'Failed to delete place.');
        return;
      }
      if (editing && editing.id === place.id) setEditing(null);
      load();
    },
    [editing, load]
  );

  // Advance the status stamp through the visit flow (skip excluded).
  const advanceStatus = useCallback(
    async (place) => {
      const next = NEXT_STATUS[place.status] || 'to_visit';
      const { error } = await supabase
        .from('prospects')
        .update({ status: next })
        .eq('id', place.id);
      if (error) {
        setLoadError(error.message || 'Failed to update status.');
        return;
      }
      load();
    },
    [load]
  );

  // Set a place to 'skip' from the row (the small control).
  const skipPlace = useCallback(
    async (place) => {
      const { error } = await supabase
        .from('prospects')
        .update({ status: 'skip' })
        .eq('id', place.id);
      if (error) {
        setLoadError(error.message || 'Failed to update status.');
        return;
      }
      load();
    },
    [load]
  );

  // Counts per status for the filter labels (skip excluded from these tabs).
  const counts = useMemo(() => {
    const c = { all: 0, to_visit: 0, visited: 0, pitched: 0, won: 0 };
    for (const p of places) {
      if (p.status === 'skip') continue;
      c.all += 1;
      if (c[p.status] !== undefined) c[p.status] += 1;
    }
    return c;
  }, [places]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = places.filter((p) => {
      // Skipped places stay hidden from the visit tabs.
      if (p.status === 'skip') return false;
      if (filter !== 'all' && p.status !== filter) return false;
      if (!q) return true;
      const hay = `${p.name || ''} ${p.business_type || ''} ${
        p.city || ''
      }`.toLowerCase();
      return hay.includes(q);
    });
    rows.sort((a, b) => {
      const pr =
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
      if (pr !== 0) return pr;
      const st =
        (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
      if (st !== 0) return st;
      return (a.name || '').localeCompare(b.name || '');
    });
    return rows;
  }, [places, filter, search]);

  return (
    <div className="places" ref={formTopRef}>
      <div className="card places-intro">
        <div className="card-label">Places to hit</div>
        <h1 className="places-title">PLACES TO HIT</h1>
        <p className="places-lede muted">
          Local businesses in NW Calgary to pitch. Tap directions to navigate
          there.
        </p>
      </div>

      <PlaceForm
        editing={editing}
        prefillType={prefillType}
        onPrefillConsumed={() => setPrefillType('')}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onCancelEdit={cancelEdit}
      />

      {/* Target ideas: tap a chip to prefill the business type. */}
      <div className="card target-ideas">
        <div className="card-label">Target ideas</div>
        <div className="idea-chips">
          {TARGET_IDEAS.map((t) => (
            <button
              key={t}
              type="button"
              className="idea-chip"
              onClick={() => fillType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter */}
      <div className="seg status-filter">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={filter === s.value ? 'on' : ''}
            onClick={() => setFilter(s.value)}
          >
            {s.label} {counts[s.value] ?? 0}
          </button>
        ))}
      </div>

      {/* Places list */}
      <div className="card">
        <div className="card-label">Places</div>

        <div className="field place-search">
          <input
            type="search"
            className="input"
            value={search}
            placeholder="Search name, type, or community"
            inputMode="search"
            autoComplete="off"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() ? (
            <button
              type="button"
              className="place-search-clear"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              Clear
            </button>
          ) : null}
        </div>

        {!loading && !loadError ? (
          <div className="place-count muted">
            {visible.length === 1 ? '1 place' : `${visible.length} places`}
            {search.trim() || filter !== 'all' ? ` of ${counts.all}` : ''}
          </div>
        ) : null}

        {loadError ? <div className="form-error">{loadError}</div> : null}
        {loading ? (
          <div className="muted load-line">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="muted load-line">
            {search.trim() || filter !== 'all'
              ? 'No matches.'
              : 'No places yet. Add the first business to hit above.'}
          </div>
        ) : (
          <div className="place-list">
            {visible.map((place) => {
              const sub = [place.business_type, place.city]
                .filter(Boolean)
                .join(' - ');
              return (
                <div className="list-item place-row" key={place.id}>
                  <div className="place-main">
                    <span className="place-name">{place.name}</span>
                    {sub ? <span className="place-sub">{sub}</span> : null}
                    <span className="place-stamps">
                      <span
                        className={`chip prio-${place.priority || 'medium'}`}
                      >
                        {place.priority === 'high'
                          ? 'High'
                          : place.priority === 'low'
                          ? 'Low'
                          : 'Med'}
                      </span>
                      <button
                        type="button"
                        className={`stamp stamp-${place.status || 'to_visit'}`}
                        onClick={() => advanceStatus(place)}
                        aria-label="Advance status"
                      >
                        {statusLabel(place.status)}
                      </button>
                    </span>
                    <a
                      className="place-directions"
                      href={directionsHref(place)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Directions
                    </a>
                  </div>
                  <div className="place-meta">
                    <div className="place-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => startEdit(place)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(place)}
                      >
                        Delete
                      </button>
                    </div>
                    {place.status !== 'skip' ? (
                      <button
                        type="button"
                        className="place-skip"
                        onClick={() => skipPlace(place)}
                      >
                        Skip
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shared datalists for the form fields. */}
      <datalist id="place-types">
        {BUSINESS_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="place-communities">
        {COMMUNITIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

/* ---------------- Place form ---------------- */

function PlaceForm({
  editing,
  prefillType,
  onPrefillConsumed,
  onSaved,
  onCancelEdit,
}) {
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [community, setCommunity] = useState('');
  const [address, setAddress] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('to_visit');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  useEffect(() => {
    if (editing) {
      setName(editing.name || '');
      setBusinessType(editing.business_type || '');
      setCommunity(editing.city || '');
      setAddress(editing.address || '');
      setPriority(editing.priority || 'medium');
      setStatus(editing.status || 'to_visit');
      setNotes(editing.notes || '');
      setError('');
    }
  }, [editing]);

  // A tapped target-idea chip fills the business type without touching edit mode.
  useEffect(() => {
    if (prefillType) {
      setBusinessType(prefillType);
      onPrefillConsumed();
    }
  }, [prefillType, onPrefillConsumed]);

  // Reset the add form; keep priority sticky for fast repeat entry.
  function resetForm() {
    setName('');
    setBusinessType('');
    setCommunity('');
    setAddress('');
    setStatus('to_visit');
    setNotes('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Business name is required.');
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      business_type: businessType.trim() ? businessType.trim() : null,
      city: community.trim() ? community.trim() : null,
      address: address.trim() ? address.trim() : null,
      priority,
      notes: notes.trim() ? notes.trim() : null,
    };

    let res;
    if (isEdit) {
      // Edit can change status (including skip); new rows insert as to_visit.
      res = await supabase
        .from('prospects')
        .update({ ...payload, status })
        .eq('id', editing.id);
    } else {
      res = await supabase
        .from('prospects')
        .insert({ ...payload, status: 'to_visit' });
    }

    setSaving(false);
    if (res.error) {
      setError(res.error.message || 'Failed to save place.');
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
      <div className="card-label">{isEdit ? 'Edit place' : 'New place'}</div>

      <div className="field">
        <label className="label">Business name</label>
        <input
          type="text"
          className="input"
          value={name}
          placeholder="Business name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label">Business type</label>
          <input
            type="text"
            className="input"
            value={businessType}
            list="place-types"
            placeholder="Type or pick"
            autoComplete="off"
            onChange={(e) => setBusinessType(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Community / area</label>
          <input
            type="text"
            className="input"
            value={community}
            list="place-communities"
            placeholder="NW community"
            autoComplete="off"
            onChange={(e) => setCommunity(e.target.value)}
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
        <label className="label">Priority</label>
        <div className="seg">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              className={priority === p.value ? 'on' : ''}
              onClick={() => setPriority(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isEdit ? (
        <div className="field">
          <label className="label">Status</label>
          <div className="seg status-seg">
            {['to_visit', 'visited', 'pitched', 'won', 'skip'].map((s) => (
              <button
                key={s}
                type="button"
                className={status === s ? 'on' : ''}
                onClick={() => setStatus(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add place'}
        </button>
      </div>
    </form>
  );
}
