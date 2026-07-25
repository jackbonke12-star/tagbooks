// Dynamic social-share (Open Graph) image for the customer-facing Review Tap
// pages, built with the framework-native next/og. This is a Next.js file
// convention: the route /r/<slug> automatically gets this 1200x630 PNG as its
// og:image + twitter:image. Everything here is dependency-free and uses the
// flexbox subset next/og supports (inline styles only, no className, and every
// element with >1 child must set display:flex).

import { ImageResponse } from 'next/og';
import { getReviewPage } from '../../../lib/reviewPages';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Leave a review';

const DEFAULT_ACCENT = '#2456e6';
const FIELD = '#f6f5f1'; // warm-white lower field
const INK = '#14181d';
const GOLD = '#fbbc04';
const MUTED = '#6b7280';

// Five gold stars drawn as inline SVG so the glyph renders identically across
// every platform's preview crawler (some strip emoji/font stars).
function Stars() {
  return (
    <svg width="360" height="72" viewBox="0 0 360 72" fill="none">
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          transform={`translate(${i * 72}, 0)`}
          d="M36 6l8.6 17.4 19.2 2.8-13.9 13.5 3.3 19.1L36 49.3 18.7 58.8l3.3-19.1L8.1 26.2l19.2-2.8L36 6z"
          fill={GOLD}
        />
      ))}
    </svg>
  );
}

export default async function Image({ params }) {
  const { slug } = await params;

  let page = null;
  try {
    page = await getReviewPage(slug);
  } catch {
    // Never let a data hiccup error the image route — fall through to default.
    page = null;
  }

  const accent = (page && page.accent_color) || DEFAULT_ACCENT;
  const businessName = (page && page.business_name) || 'Review Tap';
  const monogram = (businessName.trim()[0] || 'R').toUpperCase();
  const logoUrl = page && page.logo_url;

  // Prefer the business logo when present; the monogram tile is the safe
  // default that always renders.
  let brandMark;
  try {
    if (logoUrl) {
      brandMark = (
        <img
          src={logoUrl}
          width={132}
          height={132}
          style={{
            width: 132,
            height: 132,
            borderRadius: 28,
            objectFit: 'cover',
            background: '#ffffff',
          }}
        />
      );
    }
  } catch {
    brandMark = undefined;
  }
  if (!brandMark) {
    brandMark = (
      <div
        style={{
          display: 'flex',
          width: 132,
          height: 132,
          borderRadius: 28,
          background: '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
          fontSize: 82,
          fontWeight: 800,
        }}
      >
        {monogram}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: FIELD,
        }}
      >
        {/* Top accent band with the brand mark */}
        <div
          style={{
            display: 'flex',
            height: 220,
            width: '100%',
            background: accent,
            alignItems: 'center',
            paddingLeft: 72,
            paddingRight: 72,
          }}
        >
          {brandMark}
        </div>

        {/* Lower field: name, stars, call to action */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            paddingLeft: 72,
            paddingRight: 72,
            paddingTop: 56,
            justifyContent: 'flex-start',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 64,
              fontWeight: 800,
              color: INK,
              lineHeight: 1.05,
            }}
          >
            {businessName}
          </div>

          <div style={{ display: 'flex', marginTop: 28 }}>
            <Stars />
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 30,
              color: MUTED,
            }}
          >
            Tap to leave a Google review
          </div>
        </div>

        {/* Bottom-right wordmark */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: 44,
            bottom: 36,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: MUTED,
          }}
        >
          Review Tap
        </div>
      </div>
    ),
    { ...size }
  );
}
