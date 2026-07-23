'use client';

import './products.css';
import { PRODUCTS, money } from '../../lib/catalog';

// Gallery exhibits: paper-framed photo clippings pinned into the ledger.
const GALLERY = [
  {
    src: '/products/coin-finishes.jpg',
    alt: 'Three review coin finishes: matte black, silver, and gold',
    caption: 'Three finishes - matte black, silver, gold',
  },
  {
    src: '/products/coin-stand.jpg',
    alt: 'Review coin resting in a counter display stand',
    caption: 'Counter display stand',
  },
  {
    src: '/products/coin-tap.jpg',
    alt: 'A customer tapping the review coin with a phone',
    caption: 'Tap to review in seconds',
  },
];

// Price list excludes the catch-all 'other' entry (no fixed price).
const OFFERINGS = PRODUCTS.filter((p) => p.value !== 'other');

export default function ProductsPage() {
  return (
    <div className="products">
      {/* HERO - flagship coin exhibit */}
      <div className="card prod-hero">
        <div className="card-label">Products</div>
        <div className="hero-inner">
          <figure className="exhibit exhibit-hero">
            <div className="exhibit-frame">
              <img
                className="exhibit-img"
                src="/products/coin-hero.jpg"
                alt="Round NFC review tag coin, the flagship product"
              />
            </div>
            <span className="price-stamp price-hero">$149</span>
          </figure>
          <div className="hero-copy">
            <h1 className="hero-headline">THE REVIEW COIN</h1>
            <p className="hero-pitch">
              Customers tap it. You get 5-star reviews.
            </p>
            <p className="hero-note muted">
              A round metal NFC disc. One tap on any phone opens your Google
              review page - no app, no typing.
            </p>
          </div>
        </div>
      </div>

      {/* GALLERY - exhibits pinned into the book */}
      <div className="card">
        <div className="card-label">The exhibit</div>
        <div className="gallery">
          {GALLERY.map((shot, i) => (
            <figure className={`exhibit exhibit-tilt-${i % 3}`} key={shot.src}>
              <div className="exhibit-frame">
                <img
                  className="exhibit-img"
                  src={shot.src}
                  alt={shot.alt}
                />
              </div>
              <figcaption className="exhibit-caption">
                {shot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* PRICE LIST - ledger offerings */}
      <div className="card">
        <div className="card-label">Price list</div>
        <div className="pricelist">
          {OFFERINGS.map((p) => (
            <div className="price-row" key={p.value}>
              <span className="price-name">{p.label}</span>
              <span className="price-dots" aria-hidden="true" />
              <span className="price-amount">
                {money(p.price)}
                {p.recurring ? '/mo' : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="pricelist-rule" aria-hidden="true" />
      </div>
    </div>
  );
}
