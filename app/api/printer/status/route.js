// Proxy: GET /api/printer/status -> local agent GET /status.
//
// Reads BAMBU_AGENT_URL / BAMBU_AGENT_SECRET (server-only). If the URL is
// unset, returns { configured:false } so the UI shows a calm setup card.
// Uses only fetch + AbortController - no agent-only deps bundled here.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const base = (process.env.BAMBU_AGENT_URL || '').trim();
  const secret = process.env.BAMBU_AGENT_SECRET || '';

  if (!base) {
    return Response.json({ configured: false });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/status`, {
      headers: { 'x-agent-secret': secret },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return Response.json({ configured: true, error: 'unreachable' });
    }
    const data = await res.json();
    return Response.json({ configured: true, ...data });
  } catch {
    return Response.json({ configured: true, error: 'unreachable' });
  } finally {
    clearTimeout(timer);
  }
}
