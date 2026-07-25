// Server-safe data layer for the customer-facing "Review Tap" pages.
//
// IMPORTANT: this module is imported by SERVER components, sitemap.js and the
// opengraph-image route, so it must NEVER import lib/supabase.js (that file is
// 'use client'). We talk to Supabase directly over PostgREST with plain fetch
// and the public URL + anon key env vars, mirroring lib/agentUrl.js.

export const SITE_URL = 'https://tagbooks.vercel.app';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// Build a PostgREST request URL + the auth headers Supabase requires. `opts`
// is passed straight through to fetch (cache / revalidate / etc.). Returns null
// if env vars are missing so callers degrade gracefully instead of throwing.
async function restGet(path, opts) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network / parse failures never bubble up to the render.
    return null;
  }
}

// Fetch a single published-or-draft review page by slug and resolve a friendly
// social-proof count. ISR-cached (revalidate 300s) so pages stay fast + fresh.
// Returns null when the slug has no row (so the caller can notFound()).
export async function getReviewPage(slug) {
  const rows = await restGet(
    `review_pages?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
    { next: { revalidate: 300 }, cache: 'force-cache' }
  );
  const row = rows && rows[0];
  if (!row) return null;

  // Resolve proofCount from the freshest source available:
  //   1) latest review_snapshots.review_count for this client, then
  //   2) clients.baseline_reviews, then
  //   3) the page's own review_count column.
  let proofCount = null;
  if (row.client_id) {
    const snaps = await restGet(
      `review_snapshots?client_id=eq.${encodeURIComponent(row.client_id)}` +
        `&select=review_count,captured_at&order=captured_at.desc&limit=1`,
      { next: { revalidate: 300 } }
    );
    const snap = snaps && snaps[0];
    if (snap && snap.review_count != null) proofCount = snap.review_count;

    if (proofCount == null) {
      const clients = await restGet(
        `clients?id=eq.${encodeURIComponent(row.client_id)}` +
          `&select=baseline_reviews`,
        { next: { revalidate: 300 } }
      );
      const client = clients && clients[0];
      if (client && client.baseline_reviews != null) {
        proofCount = client.baseline_reviews;
      }
    }
  }
  if (proofCount == null && row.review_count != null) {
    proofCount = row.review_count;
  }

  return { ...row, proofCount };
}

// List every published page for the sitemap. Longer revalidate (1h) since the
// set of pages changes rarely. Returns [] on any failure.
export async function listPublishedReviewPages() {
  const rows = await restGet(
    'review_pages?published=eq.true&select=slug,created_at',
    { next: { revalidate: 3600 } }
  );
  return Array.isArray(rows) ? rows : [];
}

// Friendly "floor" for a social-proof count so we never show an oddly precise
// number. Rounds DOWN to the nearest 10 for n >= 100, else the nearest 5.
// Returns null for null / tiny counts (< 5) — we never brag about a handful.
export function proofFloor(n) {
  if (n == null) return null;
  const num = Number(n);
  if (!Number.isFinite(num) || num < 5) return null;
  const step = num >= 100 ? 10 : 5;
  return Math.floor(num / step) * step;
}
