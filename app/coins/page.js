'use client';

import './coins.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { qrSvg } from '../../lib/qr';

export default function CoinsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('clients')
      .select('id, business_name, google_review_url')
      .not('google_review_url', 'is', null)
      .neq('google_review_url', '')
      .order('business_name', { ascending: true });
    if (error) {
      setLoadError(error.message || 'Failed to load review coins.');
      setLoading(false);
      return;
    }
    // Belt-and-braces: drop any whitespace-only links the query missed.
    setClients((data || []).filter((c) => (c.google_review_url || '').trim()));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: new review links added on the Clients page appear here.
  useRealtime(['clients'], load);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      (c.business_name || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  return (
    <div className="coins">
      {/* Header + print action (hidden on print). */}
      <div className="card coins-head">
        <div className="card-label">Review coins</div>
        <p className="coins-intro muted">
          Each coin below turns a client&apos;s Google review link into a
          scannable QR plus the raw URL to write onto the physical NFC coin.
        </p>

        <div className="coins-toolbar">
          <div className="field coins-search">
            <input
              type="search"
              className="input"
              value={search}
              placeholder="Search business name"
              inputMode="search"
              autoComplete="off"
              onChange={(e) => setSearch(e.target.value)}
            />
            {search.trim() ? (
              <button
                type="button"
                className="coins-search-clear"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                Clear
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="btn coins-print-btn"
            onClick={handlePrint}
            disabled={visible.length === 0}
          >
            Print sheet
          </button>
        </div>

        {!loading && !loadError ? (
          <div className="coins-count muted">
            {visible.length === 1 ? '1 coin' : `${visible.length} coins`}
            {search.trim() ? ` of ${clients.length}` : ''}
          </div>
        ) : null}

        {loadError ? <div className="form-error">{loadError}</div> : null}
      </div>

      {loading ? (
        <div className="card muted">Loading…</div>
      ) : clients.length === 0 ? (
        <div className="card coins-empty">
          <div className="coins-empty-line muted">
            No review links on file yet. Add a Google review link to a client on
            the{' '}
            <Link className="coins-empty-link" href="/clients">
              Clients page
            </Link>{' '}
            and its coin will appear here.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card muted">No matches.</div>
      ) : (
        <div className="coins-grid">
          {visible.map((client) => (
            <CoinCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Coin card ---------------- */

function CoinCard({ client }) {
  const [copied, setCopied] = useState(false);
  const url = (client.google_review_url || '').trim();

  // Build the QR SVG once per URL. Runs client-side only ('use client').
  const svg = useMemo(() => qrSvg(url), [url]);

  const copy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked (permissions / insecure context): fail quietly.
    }
  }, [url]);

  return (
    <div className="coin-card">
      <div className="coin-tile">
        {svg ? (
          <div
            className="coin-qr"
            // qrSvg returns a trusted, self-built SVG string (no user HTML).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="coin-qr-missing muted">Invalid link</div>
        )}
      </div>

      <div className="coin-name">{client.business_name}</div>

      <div className="coin-url-row">
        <span className="coin-url" title={url}>
          {url}
        </span>
        <button
          type="button"
          className="btn btn-ghost coin-copy"
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="coin-hint muted">Write this URL to the NFC coin.</div>
    </div>
  );
}
