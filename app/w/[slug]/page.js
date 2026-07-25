'use client';

import './wifi-public.css';
import { use, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// Public, PIN-free WiFi gate. A customer opens /w/<slug>, is asked to leave a
// Google review, and after tapping "Leave a Review" the WiFi name + password
// are revealed. The tap is the gate — we can't verify a review really happened.
export default function WifiGatePage({ params }) {
  // Next 16: params is a promise; unwrap with React.use().
  const { slug } = use(params);

  const [status, setStatus] = useState('loading'); // loading | ready | missing | error
  const [gate, setGate] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('wifi_gates')
        .select(
          'business_name, google_review_url, wifi_ssid, wifi_password, note'
        )
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setStatus('error');
        return;
      }
      if (!data) {
        setStatus('missing');
        return;
      }
      setGate(data);
      setStatus('ready');
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onLeaveReview = useCallback(() => {
    // Reveal the WiFi regardless — the tap is the gate. If a review URL exists,
    // also open it in a new tab so the customer can actually leave the review.
    setRevealed(true);
    if (gate && gate.google_review_url) {
      try {
        window.open(gate.google_review_url, '_blank', 'noopener,noreferrer');
      } catch {
        /* popup blocked: the WiFi still reveals; link stays available below */
      }
    }
  }, [gate]);

  const copyPassword = useCallback(async () => {
    if (!gate || typeof navigator === 'undefined' || !navigator.clipboard)
      return;
    try {
      await navigator.clipboard.writeText(gate.wifi_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: fail quietly */
    }
  }, [gate]);

  if (status === 'loading') {
    return (
      <div className="wg-shell">
        <div className="wg-card wg-loading">Loading…</div>
      </div>
    );
  }

  if (status === 'missing' || status === 'error') {
    return (
      <div className="wg-shell">
        <div className="wg-card wg-inactive">
          <div className="wg-brand">TagBooks</div>
          <p className="wg-inactive-line">
            This link isn&rsquo;t active. Ask the front desk for the WiFi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wg-shell">
      <div className="wg-card">
        <div className="wg-business">{gate.business_name}</div>

        {!revealed ? (
          <>
            <h1 className="wg-headline">
              Leave us a Google review to get the WiFi
            </h1>
            <p className="wg-sub">
              It takes ten seconds and helps us out a ton. Tap below to leave
              your review and unlock the network.
            </p>
            <button
              type="button"
              className="wg-btn"
              onClick={onLeaveReview}
            >
              Leave a Review
            </button>
          </>
        ) : (
          <>
            <div className="wg-thanks">Thanks — you&rsquo;re connected.</div>
            <div className="wg-creds">
              <div className="wg-cred">
                <span className="wg-cred-label">Network</span>
                <span className="wg-cred-value">{gate.wifi_ssid}</span>
              </div>
              <div className="wg-cred">
                <span className="wg-cred-label">Password</span>
                <span className="wg-cred-value wg-cred-pass">
                  {gate.wifi_password}
                </span>
                <button
                  type="button"
                  className={`wg-copy${copied ? ' copied' : ''}`}
                  onClick={copyPassword}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {gate.note ? <p className="wg-note">{gate.note}</p> : null}

            {gate.google_review_url ? (
              <a
                className="wg-review-again"
                href={gate.google_review_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Didn&rsquo;t open? Leave your review here
              </a>
            ) : null}
          </>
        )}
      </div>

      <div className="wg-foot">Powered by TagBooks</div>
    </div>
  );
}
