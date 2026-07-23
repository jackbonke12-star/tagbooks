// Proxy: POST /api/printer/control -> local agent POST /control.
// Forwards { action: 'pause' | 'resume' | 'stop' }.

import { resolveAgentUrl } from '../../../../lib/agentUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
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

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = body && body.action;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/control`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-secret': secret,
      },
      body: JSON.stringify({ action }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return Response.json({ configured: true, error: 'unreachable' }, { status: 502 });
    }
    const data = await res.json();
    return Response.json({ configured: true, ...data });
  } catch {
    return Response.json({ configured: true, error: 'unreachable' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
