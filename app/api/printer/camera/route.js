// Proxy: GET /api/printer/camera -> local agent GET /camera (latest JPEG frame).
// PIN-gated (x-app-pin) like the other printer routes. Returns image/jpeg bytes,
// or a 503 JSON when the camera isn't available (cloud mode / no frame yet).

import { resolveAgentUrl } from '../../../../lib/agentUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const appPin = (process.env.APP_PIN || '').trim();
  if (appPin && (request.headers.get('x-app-pin') || '').trim() !== appPin) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const base = (await resolveAgentUrl()).trim();
  const secret = process.env.BAMBU_AGENT_SECRET || '';
  if (!base) return Response.json({ configured: false }, { status: 503 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/camera`, {
      headers: { 'x-agent-secret': secret },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ error: 'no camera' }, { status: 503 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'unreachable' }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
