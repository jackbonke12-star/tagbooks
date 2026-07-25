'use client';

// Coin Models tab: a curated shelf of safe, free printable NFC review-coin
// designs. Each card shows a finished-look render and opens a detail sheet with
// the fit size, source platform, designer, a license note, and an outbound link
// to download the design. Static data (no DB) — these are external references we
// pick from before printing. Reuses the Products showcase styling so it stays
// on-theme, plus a few model-only bits in models.css.

import '../products/products.css';
import './models.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Five hand-picked printable coin designs. Images are the finished-look renders
// in public/models. Each links back to its free source page. License is left
// deliberately cautious: most source pages don't state explicit commercial
// terms, so we flag "verify before reselling" rather than assume.
const MODELS = [
  {
    id: 'tagbooks-review-coin',
    no: '01',
    name: 'TagBooks Review Coin',
    designer: 'TagBooks (our design)',
    platform: 'TagBooks',
    own: true,
    download: '/models/review-coin.stl',
    image: '/models/model-01.png',
    fits: '38mm coin · 25mm sticker',
    tagline: 'Our own coin — five embossed stars, ready to print.',
    description:
      'Our in-house 38mm coin with five beveled embossed stars on the face and a 25.6mm x 0.6mm recess on the back sized for the 25mm NTAG215 stickers we buy — peel, press into the pocket, done. The preview is a render of the actual STL, so it prints exactly as shown. Watertight, no license strings: free for us to print and sell.',
    availability: 'Free — our design',
    print_time: '~20 min each',
    bulk_info: 'Plates ~16 per bed for batch runs.',
    license: 'Our own design — free to print and sell, no third-party license.',
  },
  {
    id: 'tagbooks-keychain-coin',
    no: '06',
    name: 'Keychain Loop Coin',
    designer: 'TagBooks (our design)',
    platform: 'TagBooks',
    own: true,
    download: '/models/review-coin-keychain.stl',
    image: '/models/model-06.png',
    fits: '38mm coin · 4mm loop · 25mm sticker',
    tagline: 'No. 01 with a built-in keyring loop — clips to keys, no hardware.',
    description:
      'Our 38mm review coin with a keyring loop (4mm inner hole) built straight into the printed body — no jump ring or metal hardware to add. Same five faceted embossed stars and 25.6mm x 0.6mm NTAG215 back pocket as No. 01; the loop sits in the coin’s own plane so it prints flat as one part. The preview is a render of the actual STL, so it prints exactly as shown. Print at 0.2mm layer height with supports enabled for the loop.',
    availability: 'Free — our design',
    print_time: '~22 min each',
    bulk_info: 'Loop prints flat in-plane; plates like No. 01.',
    license: 'Our own design — free to print and sell, no third-party license.',
  },
  {
    id: 'filament-sample-coin',
    no: '02',
    name: 'Gradient Sample Coin',
    designer: 'ponzerdesigns',
    platform: 'Printables',
    url: 'https://www.printables.com/model/602871-filament-sample-coin-with-nfc',
    image: '/models/coin-gradient.jpg',
    fits: '25mm (1 inch) NFC tag',
    tagline: 'Translucent gradient face, premium feel.',
    description:
      'A coin-shaped disc with a radial transparency gradient and an embedded NFC cavity — originally a filament sample, ideal repurposed as a good-looking tap-to-review coin.',
    availability: 'Free download',
    print_time: '~30 min each',
    bulk_info: 'Best one colour per plate for a clean gradient.',
    license: 'Free download — confirm commercial-use terms on Printables before reselling.',
  },
  {
    id: 'nfc-keychain-holder',
    no: '03',
    name: 'Keychain Coin Holder',
    designer: 'russdogg',
    platform: 'Printables',
    url: 'https://www.printables.com/model/98903-nfc-tag-keychain-holder-for-ntag215-25mm-tokens',
    image: '/models/coin-keychain.jpg',
    fits: '25mm NTAG215 tag',
    tagline: 'Snug press-fit, clips to keys.',
    description:
      'A keyring holder that grips a 25mm coin with a pressure fit — hand this version to customers who want the review tap on their keychain instead of stuck to a counter.',
    availability: 'Free download',
    print_time: '~25 min each',
    bulk_info: 'Prints supportless; batch a full plate at once.',
    license: 'Free download — confirm commercial-use terms on Printables before reselling.',
  },
  {
    id: 'nfc-coin-holder',
    no: '04',
    name: 'Press-Fit Coin Holder',
    designer: 'PenguinNinja',
    platform: 'Printables',
    url: 'https://www.printables.com/model/452782-nfc-coin-holder',
    image: '/models/coin-custom.jpg',
    fits: '25mm coin (28mm outer)',
    tagline: 'Two-tone, raised custom logo.',
    description:
      'A press-fit holder that seats a 25mm NFC coin in a 28mm body — easy to print two-tone with a raised logo on the face for a branded counter piece.',
    availability: 'Free download',
    print_time: '~30 min each',
    bulk_info: 'Colour-swap the top layers for a raised logo.',
    license: 'Free download — confirm commercial-use terms on Printables before reselling.',
  },
  {
    id: 'nfc-tag-round',
    no: '05',
    name: 'Simple Round Coin',
    designer: 'MakerWorld community',
    platform: 'MakerWorld',
    url: 'https://makerworld.com/en/models/1708154-nfc-tag-round',
    image: '/models/coin-simple.jpg',
    fits: '25mm NFC tag',
    tagline: 'Plain, fast, print-farm friendly.',
    description:
      'A no-frills round coin with a chamfered edge and a flush tag pocket. The workhorse for high-volume runs where a clean disc matters more than branding.',
    availability: 'Free download',
    print_time: '~20 min each',
    bulk_info: 'Densely plates — best pick for large batches.',
    license: 'Free download — confirm commercial-use terms on MakerWorld before reselling.',
  },
];

export default function ModelsPage() {
  const [openId, setOpenId] = useState(null);

  const open = useMemo(
    () => MODELS.find((m) => m.id === openId) || null,
    [openId]
  );

  const openDetail = useCallback((id) => setOpenId(id), []);
  const closeDetail = useCallback(() => setOpenId(null), []);

  return (
    <div className="products">
      <div className="page-head">
        <h1 className="page-title">Coin Models</h1>
        <p className="page-title-sub">
          Printable NFC coin designs. No. 01 is our own coin, ready to
          download and print. The rest are free reference designs from other
          makers. Tap any card for the fit size, source, and license.
        </p>
      </div>

      {MODELS.length === 0 ? (
        <div className="card prod-empty">
          <p className="prod-empty-title">No coin models yet</p>
          <p className="prod-empty-sub muted">
            Coin designs will show up here as tappable cards, with our own
            printable design listed first.
          </p>
        </div>
      ) : (
        <div className="prod-grid">
          {MODELS.map((model) => (
            <ModelCard key={model.id} model={model} onOpen={openDetail} />
          ))}
        </div>
      )}

      {open ? <ModelDetail model={open} onClose={closeDetail} /> : null}
    </div>
  );
}

/* ---------------- Showcase card ---------------- */

function ModelCard({ model, onOpen }) {
  return (
    <button
      type="button"
      className={'prod-card' + (model.own ? ' mdl-own' : '')}
      onClick={() => onOpen(model.id)}
      aria-label={`View ${model.name} details`}
    >
      <div className="prod-shot">
        <ModelImage src={model.image} alt={model.name} />
        {model.own ? <span className="mdl-badge">Ours</span> : null}
      </div>
      <div className="prod-body">
        <div className="prod-top">
          <span className="prod-name">
            {model.no ? <span className="mdl-no">No. {model.no}</span> : null}
            {model.name}
          </span>
          <span className="prod-cat">{model.platform}</span>
        </div>
        <p className="prod-tagline">{model.tagline}</p>
        <div className="prod-foot">
          <span className="mdl-fits">{model.fits}</span>
          <span
            className={'prod-more' + (model.own ? '' : ' mdl-more-ref')}
            aria-hidden="true"
          >
            {model.own ? 'Tap to download' : 'Tap for source'}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ---------------- Detail overlay ---------------- */

function ModelDetail({ model, onClose }) {
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
      aria-label={`${model.name} details`}
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
              <div className="prod-gallery-main">
                <ModelImage src={model.image} alt={model.name} />
              </div>
              <p className="mdl-render-note">
                Rendered preview of the finished print.
              </p>
            </div>

            <div className="prod-info">
              <div className="prod-info-head">
                <h2 className="prod-info-name">
                  {model.no ? (
                    <span
                      className="mdl-no mdl-no-lg"
                      title={`Model reference number ${model.no}`}
                    >
                      No. {model.no}
                    </span>
                  ) : null}
                  {model.name}
                </h2>
                <span className="prod-cat">{model.platform}</span>
              </div>

              <p
                className={
                  'mdl-kind' + (model.own ? ' mdl-kind-own' : '')
                }
              >
                {model.own
                  ? 'Our design — download the STL and print it yourself.'
                  : 'Reference design by another maker — download it from the source page.'}
              </p>

              <p className="prod-info-tagline">{model.tagline}</p>

              <div className="prod-price-block">{model.fits}</div>

              <p className="prod-desc">{model.description}</p>

              <dl className="prod-specs">
                <SpecRow label="Designer" value={model.designer} />
                <SpecRow label="Source" value={model.platform} />
                <SpecRow label="Availability" value={model.availability} />
                <SpecRow label="Print time" value={model.print_time} />
                <SpecRow label="Bulk runs" value={model.bulk_info} />
              </dl>

              <div className="mdl-license">
                <span className="mdl-license-label">License</span>
                <span className="mdl-license-text">{model.license}</span>
              </div>

              <div className="mdl-actions">
                {model.download ? (
                  <a
                    href={model.download}
                    download
                    className="btn btn-primary mdl-cta"
                  >
                    Download STL
                  </a>
                ) : (
                  <a
                    href={model.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary mdl-cta"
                  >
                    Open design source
                  </a>
                )}
                {model.own ? (
                  <Link href="/printer" className="btn mdl-cta-alt">
                    Open Printer
                  </Link>
                ) : null}
              </div>
              <p className="mdl-actions-hint muted">
                {model.own
                  ? 'Download the STL, slice it in Bambu Studio, then print from the Printer tab.'
                  : 'Open source opens the maker’s page in a new tab. Download the STL there, slice it in Bambu Studio, then print from the Printer tab.'}
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

/* ---------------- Image with graceful fallback ---------------- */

function ModelImage({ src, alt }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="prod-img-fallback" aria-hidden="true">
        <span className="prod-img-fallback-mark" />
      </div>
    );
  }

  return (
    <img
      className="prod-img"
      src={src}
      alt={alt || ''}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
