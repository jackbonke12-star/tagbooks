// Proxy: GET /api/printer/status -> local agent GET /status.
//
// Reads BAMBU_AGENT_URL / BAMBU_AGENT_SECRET (server-only). If the URL is
// unset, returns { configured:false } so the UI shows a calm setup card.
// Uses only fetch + AbortController - no agent-only deps bundled here.

import { resolveAgentUrl } from '../../../../lib/agentUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  // Shared-PIN gate: if APP_PIN is set, require a matching x-app-pin header.
  // If APP_PIN is unset, the gate is unconfigured and the check is skipped.
  const appPin = (process.env.APP_PIN || '').trim();
  if (appPin && (request.headers.get('x-app-pin') || '').trim() !== appPin) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const base = (await resolveAgentUrl()).trim();
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
