'use client';

import './products.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../lib/realtime';
import { money } from '../../lib/catalog';

// Placeholder shots (real coin photos in public/products) used until a product
// carries its own images. Rotated per product so each card/gallery isn't empty
// and the detail view can show "a couple different shots".
const PLACEHOLDER_SHOTS = [
  '/products/coin-hero.jpg',
  '/products/coin-finishes.jpg',
  '/products/coin-stand.jpg',
  '/products/coin-tap.jpg',
];

// Normalize product.images (jsonb array of {url} or {name,url}) into a clean
// list of {url, name} strings. Falls back to rotated placeholder shots keyed by
// the product's sort/index so every product always has 2-3 sensible images.
function imagesFor(product, index) {
  const raw = Array.isArray(product && product.images) ? product.images : [];
  const real = raw
    .map((img) => {
      if (!img) return null;
      if (typeof img === 'string') return { url: img, name: '' };
      if (typeof img.url === 'string' && img.url) {
        return { url: img.url, name: img.name || '' };
      }
      return null;
    })
    .filter(Boolean);

  if (real.length) return real;

  // No stored images: hand out 3 rotated placeholder coin shots so galleries
  // stay populated. Offset by the product index so cards don't all lead with
  // the same photo.
  const start = Number.isFinite(index) ? index : 0;
  const shots = [];
  for (let i = 0; i < 3; i += 1) {
    const src = PLACEHOLDER_SHOTS[(start + i) % PLACEHOLDER_SHOTS.length];
    shots.push({ url: src, name: '' });
  }
  return shots;
}

// Price line: "$149.00 / kit" or "Get a quote" when price is null.
function priceLabel(product) {
  if (product == null || product.price == null || product.price === '') {
    return 'Get a quote';
  }
  const unit = product.price_unit ? ` / ${product.price_unit}` : '';
  return `${money(product.price)}${unit}`;
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('sort', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    if (error) {
      setLoadError(error.message || 'Failed to load products.');
      setLoading(false);
      return;
    }
    setProducts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: reload when products change on any device.
  useRealtime(['products'], load);

  // Precompute the resolved image list per product once, keyed by id.
  const withImages = useMemo(
    () =>
      products.map((p, i) => ({
        product: p,
        images: imagesFor(p, i),
      })),
    [products]
  );

  const open = useMemo(
    () => withImages.find((x) => x.product.id === openId) || null,
    [withImages, openId]
  );

  const openDetail = useCallback((id) => setOpenId(id), []);
  const closeDetail = useCallback(() => setOpenId(null), []);

  return (
    <div className="products">
      <div className="page-head">
        <h1 className="page-title">Products</h1>
        <p className="page-title-sub">
          What we sell. Tap any product for pricing, availability, and bulk
          order details.
        </p>
      </div>

      {loadError ? <div className="form-error">{loadError}</div> : null}

      {loading ? (
        <div className="card">
          <div className="muted load-line">Loading…</div>
        </div>
      ) : products.length === 0 ? (
        <div className="card prod-empty">
          <p className="prod-empty-title">No products yet</p>
          <p className="prod-empty-sub muted">
            Products you add to the catalog will show up here as tappable
            cards you can share with a client.
          </p>
        </div>
      ) : (
        <div className="prod-grid">
          {withImages.map(({ product, images }) => (
            <ProductCard
              key={product.id}
              product={product}
              cover={images[0]}
              onOpen={openDetail}
            />
          ))}
        </div>
      )}

      {open ? (
        <ProductDetail
          product={open.product}
          images={open.images}
          onClose={closeDetail}
        />
      ) : null}
    </div>
  );
}

/* ---------------- Showcase card ---------------- */

function ProductCard({ product, cover, onOpen }) {
  return (
    <button
      type="button"
      className="prod-card"
      onClick={() => onOpen(product.id)}
      aria-label={`View ${product.name} details`}
    >
      <div className="prod-shot">
        <ProductImage src={cover ? cover.url : ''} alt={product.name} />
      </div>
      <div className="prod-body">
        <div className="prod-top">
          <span className="prod-name">{product.name}</span>
          {product.category ? (
            <span className="prod-cat">{product.category}</span>
          ) : null}
        </div>
        {product.tagline ? (
          <p className="prod-tagline">{product.tagline}</p>
        ) : null}
        <div className="prod-foot">
          <span className="prod-price">{priceLabel(product)}</span>
          <span className="prod-more" aria-hidden="true">
            Tap for details
          </span>
        </div>
      </div>
    </button>
  );
}

/* ---------------- Detail overlay ---------------- */

function ProductDetail({ product, images, onClose }) {
  const shots = Array.isArray(images) ? images : [];
  const [active, setActive] = useState(0);

  // Dismiss on Escape. Lock body scroll while the overlay is up so the sheet
  // scrolls on its own without the page moving underneath it.
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

  const activeShot = shots[active] || shots[0] || null;

  return (
    <div
      className="prod-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} details`}
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
            {/* Gallery: large lead shot + a thumbnail strip of a couple more. */}
            <div className="prod-gallery">
              <div className="prod-gallery-main">
                <ProductImage
                  src={activeShot ? activeShot.url : ''}
                  alt={product.name}
                />
              </div>
              {shots.length > 1 ? (
                <div className="prod-thumbs">
                  {shots.map((shot, i) => (
                    <button
                      type="button"
                      key={`${shot.url}-${i}`}
                      className={`prod-thumb${i === active ? ' on' : ''}`}
                      onClick={() => setActive(i)}
                      aria-label={`Show image ${i + 1}`}
                    >
                      <ProductImage
                        src={shot.url}
                        alt={`${product.name} shot ${i + 1}`}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Copy + specs */}
            <div className="prod-info">
              <div className="prod-info-head">
                <h2 className="prod-info-name">{product.name}</h2>
                {product.category ? (
                  <span className="prod-cat">{product.category}</span>
                ) : null}
              </div>

              {product.tagline ? (
                <p className="prod-info-tagline">{product.tagline}</p>
              ) : null}

              <div className="prod-price-block">{priceLabel(product)}</div>

              {product.description ? (
                <p className="prod-desc">{product.description}</p>
              ) : null}

              <dl className="prod-specs">
                <SpecRow label="Availability" value={product.availability} />
                <SpecRow label="Lead time" value={product.lead_time} />
                <SpecRow label="Bulk orders" value={product.bulk_info} />
              </dl>

              <Link href="/money" className="btn btn-primary prod-cta">
                Add to a sale
              </Link>
              <p className="prod-cta-hint muted">
                Opens Money to log this product as a sale for a client.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// One spec line in the detail list; renders nothing when there's no value.
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

// Reserves aspect-ratio (via the CSS container) and hides itself on error so a
// broken/missing image never shows a broken-image glyph or shifts layout. When
// there's no src at all, or the load fails, a clean on-theme placeholder tile is
// shown in its place.
function ProductImage({ src, alt }) {
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
