// POST /api/reviews/refresh — pull each client's current Google review count
// and rating and store a snapshot. PIN-gated. The Google key stays server-side
// (env GOOGLE_PLACES_SERVER_KEY). Degrades cleanly: if no key is set, or the key
// is referer-restricted, it says so instead of failing — manual entry still works.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Pull the place id out of a stored Google review URL
// (…/writereview?placeid=ChIJ… or a place_id= variant).
function placeIdFrom(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const pid = u.searchParams.get('placeid') || u.searchParams.get('place_id');
    if (pid) return pid;
  } catch {
    /* fall through to regex */
  }
  const m = String(url).match(/place_?id=([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

export async function POST(request) {
  const appPin = (process.env.APP_PIN || '').trim();
  if (appPin && (request.headers.get('x-app-pin') || '').trim() !== appPin) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const key = (process.env.GOOGLE_PLACES_SERVER_KEY || '').trim();

  // Clients that have a review URL we can look up.
  const res = await fetch(
    `${SB_URL}/rest/v1/clients?select=id,business_name,google_review_url&google_review_url=not.is.null`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: 'no-store' }
  );
  const clients = res.ok ? await res.json() : [];

  if (!key) {
    return Response.json({
      configured: false,
      clients: clients.length,
      note: 'Auto-refresh needs an unrestricted Google server key in GOOGLE_PLACES_SERVER_KEY. You can still enter counts manually.',
    });
  }

  const results = [];
  let denied = 0;
  for (const c of clients) {
    const pid = placeIdFrom(c.google_review_url);
    if (!pid) {
      results.push({ client_id: c.id, error: 'no place id' });
      continue;
    }
    try {
      const g = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
          pid
        )}&fields=user_ratings_total,rating&key=${key}`,
        { cache: 'no-store' }
      );
      const data = await g.json();
      if (data.status !== 'OK') {
        if (data.status === 'REQUEST_DENIED') denied += 1;
        results.push({ client_id: c.id, error: data.status });
        continue;
      }
      const count = data.result?.user_ratings_total ?? null;
      const rating = data.result?.rating ?? null;
      await fetch(`${SB_URL}/rest/v1/review_snapshots`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          client_id: c.id,
          review_count: count,
          rating,
          source: 'google',
        }),
      });
      results.push({ client_id: c.id, review_count: count, rating });
    } catch {
      results.push({ client_id: c.id, error: 'fetch failed' });
    }
  }

  const updated = results.filter((r) => r.review_count != null).length;
  const keyRestricted = denied > 0 && updated === 0;
  return Response.json({
    configured: true,
    updated,
    keyRestricted,
    note: keyRestricted
      ? 'Your Google key is referer-restricted, so it can’t be used server-side. Create an unrestricted (or IP-restricted) server key with Places API enabled and set it as GOOGLE_PLACES_SERVER_KEY.'
      : undefined,
    results,
  });
}
