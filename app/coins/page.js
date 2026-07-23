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

  // Web NFC feature detection. The page is prerendered, so we start false
  // (matching the server render) and only flip true after mount on a client
  // that actually exposes NDEFReader. This avoids any hydration mismatch and
  // keeps SSR from ever touching window/navigator/NDEFReader.
  const [nfcSupported, setNfcSupported] = useState(false);

  // Only one card may be actively writing at a time; track its id here.
  const [writingId, setWritingId] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setNfcSupported(true);
    }
  }, []);

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

        {/* One-time platform note. Only shown when in-app NFC writing is not
            available (iPhone, any browser; or desktop). The QR + Copy link
            remain the working fallback. */}
        {!nfcSupported ? (
          <div className="coins-nfc-note" role="note">
            <span className="coins-nfc-note-tag">NFC</span>
            <span className="coins-nfc-note-text">
              On iPhone: tap Copy to grab a coin&apos;s URL, then paste it into
              the free &ldquo;NFC Tools&rdquo; app to write the coin (one time
              per coin). In-app writing works only in Chrome on Android. The
              printed QR still works on any phone camera.
            </span>
          </div>
        ) : null}

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
        <div className="card muted load-line">Loading…</div>
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
        <div className="card muted load-line">No matches.</div>
      ) : (
        <div className="coins-grid">
          {visible.map((client) => (
            <CoinCard
              key={client.id}
              client={client}
              nfcSupported={nfcSupported}
              writingId={writingId}
              setWritingId={setWritingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Coin card ---------------- */

function CoinCard({ client, nfcSupported, writingId, setWritingId }) {
  const [copied, setCopied] = useState(false);
  const url = (client.google_review_url || '').trim();

  // NFC write state for this card: idle | writing | written | error.
  const [nfcState, setNfcState] = useState('idle');
  const [nfcError, setNfcError] = useState('');

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

  // Another card is mid-write, so this one is locked out until that finishes.
  const otherWriting = writingId != null && writingId !== client.id;

  const writeCoin = useCallback(async () => {
    // Guard: never touch NDEFReader unless the feature was detected, a URL
    // exists, and no other card is currently writing.
    if (!nfcSupported || !url) return;
    if (typeof window === 'undefined' || !('NDEFReader' in window)) return;
    if (writingId != null && writingId !== client.id) return;

    setNfcError('');
    setNfcState('writing');
    setWritingId(client.id);
    try {
      const nfc = new window.NDEFReader();
      await nfc.write({
        records: [{ recordType: 'url', data: url }],
      });
      setNfcState('written');
      setTimeout(() => {
        setNfcState('idle');
      }, 4000);
    } catch (err) {
      const name = err && err.name ? err.name : '';
      let msg = 'Could not write - try again.';
      if (name === 'NotAllowedError') {
        msg = 'Permission denied - allow NFC and try again.';
      } else if (name === 'NotSupportedError') {
        msg = 'No NFC on this device.';
      } else if (name === 'NotReadableError') {
        msg = 'Could not reach the coin - hold it closer.';
      }
      setNfcError(msg);
      setNfcState('error');
      setTimeout(() => {
        setNfcState('idle');
        setNfcError('');
      }, 5000);
    } finally {
      // Release the shared lock regardless of outcome.
      setWritingId((cur) => (cur === client.id ? null : cur));
    }
  }, [nfcSupported, url, client.id, writingId, setWritingId]);

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

      {nfcSupported ? (
        <div className="coin-nfc">
          <button
            type="button"
            className="btn btn-primary coin-write"
            onClick={writeCoin}
            disabled={nfcState === 'writing' || otherWriting}
          >
            {nfcState === 'writing' ? 'Writing…' : 'Write to coin'}
          </button>

          {nfcState === 'writing' ? (
            <div className="coin-stamp coin-stamp-writing" role="status">
              Hold the coin to the top of your phone…
            </div>
          ) : nfcState === 'written' ? (
            <div className="coin-stamp coin-stamp-written" role="status">
              Coin written - tap it to test.
            </div>
          ) : nfcState === 'error' ? (
            <div className="coin-stamp coin-stamp-error" role="status">
              {nfcError}
            </div>
          ) : (
            <div className="coin-hint muted">Write this URL to the NFC coin.</div>
          )}
        </div>
      ) : (
        <div className="coin-hint muted">Write this URL to the NFC coin.</div>
      )}
    </div>
  );
}
