'use client';

// "Boost visibility on Google" checklist for the PIN-gated admin. It is an
// HONEST split: the left column lists what Review Tap already handles for the
// business automatically; the right column lists the few things that only the
// business owner can do (and that genuinely cannot be automated — chiefly
// creating and verifying a Google Business Profile). Lives inside a `.card`
// and uses the app's beige ledger tokens, not the customer-site palette.
//
// Props: { url } — the public /r/<slug> URL string (may be undefined).

import { useState } from 'react';
import './ReviewBoostChecklist.css';

// Small green check drawn as inline SVG so it inherits var(--green) via
// currentColor and stays crisp in both themes.
function Check() {
  return (
    <svg
      className="rbc-check"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3.2 3.3L13 4.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const AUTO_ITEMS = [
  'Branded review page for your business',
  'Google structured data (JSON-LD)',
  'Sitemap and robots.txt',
  'Page metadata and social share image',
  'Scannable QR code',
  'Fast, reliable hosting',
];

export default function ReviewBoostChecklist({ url }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context / permissions) — degrade quietly.
    }
  }

  return (
    <div className="card rbc">
      <div className="card-label">Boost visibility on Google</div>

      <div className="rbc-grid">
        {/* Column A: handled automatically */}
        <section className="rbc-col">
          <h3 className="rbc-col-title">Done automatically by Review Tap</h3>
          <ul className="rbc-list rbc-list-auto">
            {AUTO_ITEMS.map((label) => (
              <li key={label} className="rbc-item rbc-item-done">
                <Check />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Column B: owner-only actionable steps */}
        <section className="rbc-col">
          <h3 className="rbc-col-title">Only the business owner can do these</h3>
          <ol className="rbc-list rbc-steps">
            <li className="rbc-step">
              <span className="rbc-step-num">1</span>
              <div className="rbc-step-body">
                <a
                  className="rbc-link"
                  href="https://business.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create or claim your Google Business Profile
                </a>
                <p className="rbc-step-note">
                  Needs owner verification by Google &mdash; we cannot do this
                  for you.
                </p>
              </div>
            </li>

            <li className="rbc-step">
              <span className="rbc-step-num">2</span>
              <div className="rbc-step-body">
                <span className="rbc-step-head">
                  Copy your Google &ldquo;ask for reviews&rdquo; link
                </span>
                <p className="rbc-step-note">
                  Paste it into this page&rsquo;s Google review URL field.
                </p>
              </div>
            </li>

            <li className="rbc-step">
              <span className="rbc-step-num">3</span>
              <div className="rbc-step-body">
                <span className="rbc-step-head">
                  Add your Review Tap link as the Website / Menu link on your
                  Google profile.
                </span>
                {url ? (
                  <div className="rbc-urlrow">
                    <code className="rbc-url">{url}</code>
                    <button
                      type="button"
                      className="rbc-copy"
                      onClick={copyLink}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>

            <li className="rbc-step">
              <span className="rbc-step-num">4</span>
              <div className="rbc-step-body">
                <span className="rbc-step-head">
                  Put the link in your Instagram / Facebook bio.
                </span>
              </div>
            </li>

            <li className="rbc-step">
              <span className="rbc-step-num">5</span>
              <div className="rbc-step-body">
                <a
                  className="rbc-link"
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Submit the sitemap in Google Search Console
                </a>
                <p className="rbc-step-note">Optional, one-time.</p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <p className="rbc-caveat">
        We set up everything technical for you, but appearing in Google search
        results and Maps requires the owner to create and verify a Google
        Business Profile &mdash; that step can&rsquo;t be automated.
      </p>
    </div>
  );
}
