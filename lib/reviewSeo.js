// SEO helpers for the customer-facing "Review Tap" pages: JSON-LD structured
// data + Next.js metadata. Server-safe (no client-only imports).

import { SITE_URL } from './reviewPages';

// Map a hours-json shape { "mon": ["07:00","15:00"], ..., "sun": null } to an
// array of schema.org OpeningHoursSpecification entries, one per OPEN day.
const DAY_NAMES = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function mapOpeningHours(hours) {
  if (!hours || typeof hours !== 'object') return undefined;
  const specs = [];
  for (const key of Object.keys(DAY_NAMES)) {
    const range = hours[key];
    // Skip closed days (null / not a valid [open, close] pair).
    if (!Array.isArray(range) || range.length < 2) continue;
    const [opens, closes] = range;
    if (!opens || !closes) continue;
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_NAMES[key],
      opens,
      closes,
    });
  }
  return specs.length ? specs : undefined;
}

// Drop any key whose value is undefined so the emitted JSON-LD stays clean.
function stripUndefined(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// Build a schema.org LocalBusiness object for a review page. Returns a plain
// object ready to JSON.stringify into a <script type="application/ld+json">.
export function buildJsonLd(page) {
  const links = Array.isArray(page.links) ? page.links : [];

  const json = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: page.business_name,
    description: page.seo_description || page.tagline || undefined,
    url: `${SITE_URL}/r/${page.slug}`,
    telephone: page.phone || undefined,
    image: page.logo_url || undefined,
    address: page.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: page.address,
          addressLocality: 'Calgary',
          addressRegion: 'AB',
          addressCountry: 'CA',
        }
      : undefined,
    sameAs: links
      .map((l) => l && l.url)
      .filter((u) => /^https?:\/\//.test(u || '')),
    openingHoursSpecification: mapOpeningHours(page.hours),
    potentialAction: page.google_review_url
      ? { '@type': 'ReviewAction', target: page.google_review_url }
      : undefined,
    aggregateRating:
      page.rating && page.review_count
        ? {
            '@type': 'AggregateRating',
            ratingValue: page.rating,
            reviewCount: page.review_count,
          }
        : undefined,
  };

  return stripUndefined(json);
}

// Build a Next.js metadata object for a review page. Note we intentionally do
// NOT set openGraph.images — the sibling opengraph-image route auto-injects it.
export function buildMetadata(page) {
  const title = `${page.business_name} — Leave a Review | Calgary`;
  const description =
    page.seo_description ||
    `${page.tagline || 'Loved your visit?'} Leave ${page.business_name} a quick Google review — it takes 30 seconds.`;
  const url = `${SITE_URL}/r/${page.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: !!page.published, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Review Tap',
      type: 'website',
    },
    twitter: { card: 'summary_large_image' },
  };
}
