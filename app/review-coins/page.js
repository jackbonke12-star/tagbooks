'use client';

// Google Review Coin — four print-ready 25mm coin artworks. Each option has a
// finished-look face render and a dimensioned spec PDF (⌀ 25mm, NTAG215, print
// at 100%) you can download and hand to a printer or print at true size.
// Static data (no DB) — these are design assets, not ledger rows.

import '../products/products.css';
import './review-coins.css';
import { useCallback, useEffect, useMemo, useState } from 'react';

const OPTIONS = [
  {
    id: 1,
    name: 'Classic Tap',
    tagline: 'Google G, five gold stars, phone tapping with NFC waves.',
    description:
      'The all-rounder. Multicolor Google “G”, a row of five gold stars, bold “Leave a Review”, and a phone-tap icon with contactless waves so customers know to tap it. Reads as official Google at a glance.',
    image: '/review-coins/option-1.png',
    pdf: '/review-coins/option-1.pdf',
    sticker: '/review-coins/classic-tap-sticker.png',
  },
  {
    id: 2,
    name: 'Minimal',
    tagline: 'Clean and quiet — subtle tap icon, lots of breathing room.',
    description:
      'Stripped back. Same trust cues — G logo, five stars, “Leave a Review” — with a smaller, quieter tap icon and more white space. Best where a busy graphic would feel out of place.',
    image: '/review-coins/option-2.png',
    pdf: '/review-coins/option-2.pdf',
  },
  {
    id: 3,
    name: 'Embossed Rim',
    tagline: 'Raised beveled edge, uppercase LEAVE A REVIEW — premium feel.',
    description:
      'The premium pick. A raised beveled rim gives it a coin-like weight, and the uppercase “LEAVE A REVIEW” reads bold and confident. Looks like a finished product, not a sticker.',
    image: '/review-coins/option-3.png',
    pdf: '/review-coins/option-3.pdf',
  },
  {
    id: 4,
    name: 'Dynamic Tap',
    tagline: 'Tilted phone mid-tap — energetic, motion-forward.',
    description:
      'The lively one. The phone is caught mid-tap at an angle with the NFC waves radiating out — it suggests the action instead of just labeling it. Great for younger, high-traffic spots.',
    image: '/review-coins/option-4.png',
    pdf: '/review-coins/option-4.pdf',
  },
];

export default function ReviewCoinsPage() {
  const [openId, setOpenId] = useState(null);
  const open = useMemo(
    () => OPTIONS.find((o) => o.id === openId) || null,
    [openId]
  );
  const openDetail = useCallback((id) => setOpenId(id), []);
  const closeDetail = useCallback(() => setOpenId(null), []);

  return (
    <div className="products">
      <div className="page-head">
        <h1 className="page-title">Google Review Coin</h1>
        <p className="page-title-sub">
          Four print-ready coin designs — official Google look, “Leave a
          Review”, tap-to-review icon. Every option is a{' '}
          <strong>25&nbsp;mm</strong> face sized for our NTAG215 stickers, with
          a dimensioned spec PDF you can print at true size or send to a printer.
        </p>
      </div>

      <div className="prod-grid">
        {OPTIONS.map((o) => (
          <CoinCard key={o.id} option={o} onOpen={openDetail} />
        ))}
      </div>

      {open ? <CoinDetail option={open} onClose={closeDetail} /> : null}
    </div>
  );
}

function CoinCard({ option, onOpen }) {
  return (
    <div className="prod-card rc-card">
      <button
        type="button"
        className="rc-shot-btn"
        onClick={() => onOpen(option.id)}
        aria-label={`View ${option.name} details`}
      >
        <div className="prod-shot rc-shot">
          <img
            className="prod-img"
            src={option.image}
            alt={`${option.name} Google review coin`}
            loading="lazy"
          />
          <span className="rc-size">&#8960; 25 mm</span>
        </div>
      </button>
      <div className="prod-body">
        <div className="prod-top">
          <span className="prod-name">
            <span className="rc-opt">Option {option.id}</span>
            {option.name}
          </span>
        </div>
        <p className="prod-tagline">{option.tagline}</p>
        <div className="rc-actions">
          <a
            href={option.pdf}
            download
            className="btn btn-primary rc-btn"
            onClick={(e) => e.stopPropagation()}
          >
            Download PDF
          </a>
          <button
            type="button"
            className="btn rc-btn"
            onClick={() => onOpen(option.id)}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  );
}

function CoinDetail({ option, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="prod-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${option.name} details`}
      onClick={onClose}
    >
      <div className="prod-sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="prod-close"
          onClick={onClose}
          aria-label="Close"
        >
          Close
        </button>

        <div className="prod-sheet-scroll">
          <div className="prod-detail">
            <div className="prod-gallery">
              <div className="prod-gallery-main rc-gallery">
                <img
                  className="prod-img"
                  src={option.image}
                  alt={`${option.name} Google review coin`}
                />
              </div>
              <p className="mdl-render-note">
                Finished-look preview of the printed 25&nbsp;mm coin face.
              </p>
            </div>

            <div className="prod-info">
              <div className="prod-info-head">
                <h2 className="prod-info-name">
                  <span className="rc-opt rc-opt-lg">Option {option.id}</span>
                  {option.name}
                </h2>
              </div>

              <p className="prod-info-tagline">{option.tagline}</p>
              <div className="prod-price-block">&#8960; 25 mm · NTAG215</div>
              <p className="prod-desc">{option.description}</p>

              <dl className="prod-specs">
                <SpecRow label="Diameter" value="25 mm" />
                <SpecRow label="NFC tag" value="NTAG215 · 25 mm sticker" />
                <SpecRow label="Finish" value="Matte white PET" />
                <SpecRow label="Print scale" value="100% / Actual size" />
                <SpecRow label="Encodes to" value="Google review URL" />
              </dl>

              <div className="rc-detail-actions">
                <a
                  href={option.pdf}
                  download
                  className="btn btn-primary mdl-cta"
                >
                  Download spec PDF
                </a>
                <a
                  href={option.pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn mdl-cta-alt"
                >
                  Open PDF
                </a>
                {option.sticker ? (
                  <a
                    href={option.sticker}
                    download
                    className="btn mdl-cta-alt"
                  >
                    Sticker PNG (transparent)
                  </a>
                ) : null}
              </div>
              <p className="mdl-actions-hint muted">
                The PDF shows the coin with a <strong>⌀ 25&nbsp;mm</strong>{' '}
                dimension callout and an actual-size circle. Print at{' '}
                <strong>100% / Actual Size</strong> (not “fit to page”) so it
                comes out at a true 25&nbsp;mm.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="prod-spec">
      <dt className="prod-spec-label">{label}</dt>
      <dd className="prod-spec-value">{value}</dd>
    </div>
  );
}
