// POST /api/auth -> verify a shared PIN against APP_PIN (server-only).
//
// APP_PIN is read from process.env at request time and MUST NOT be exposed to
// the client (never a NEXT_PUBLIC var). Returns { ok:true } on a match,
// { ok:false } (still HTTP 200) on a mismatch. If APP_PIN is unset/empty the
// gate is disabled and we return { ok:true, disabled:true } so the app keeps
// working before the pin is configured.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const expected = (process.env.APP_PIN || '').trim();

  if (!expected) {
    return Response.json({ ok: true, disabled: true });
  }

  let pin = '';
  try {
    const body = await request.json();
    pin = body && typeof body.pin === 'string' ? body.pin : '';
  } catch {
    pin = '';
  }

  if (pin.trim() === expected) {
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false });
}
