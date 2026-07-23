// Proxy: POST /api/printer/upload -> local agent POST /upload.
//
// Best-effort multipart passthrough: read the incoming form, rebuild a
// FormData with the file, and forward it to the agent. Uses only web-standard
// fetch/FormData - no agent-only deps here.

import { resolveAgentUrl } from '../../../../lib/agentUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const base = (await resolveAgentUrl()).trim();
  const secret = process.env.BAMBU_AGENT_SECRET || '';

  if (!base) {
    return Response.json({ configured: false });
  }

  let file;
  try {
    const form = await request.formData();
    file = form.get('file');
  } catch {
    return Response.json({ configured: true, error: 'bad form data' }, { status: 400 });
  }

  if (!file || typeof file === 'string') {
    return Response.json({ configured: true, error: 'no file' }, { status: 400 });
  }

  const outbound = new FormData();
  outbound.append('file', file, file.name || 'upload.3mf');

  // Uploads can be large; give this a longer window than status/control.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/upload`, {
      method: 'POST',
      headers: { 'x-agent-secret': secret },
      body: outbound,
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
