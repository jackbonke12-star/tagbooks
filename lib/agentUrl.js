// Server-only helper: resolve the printer agent's current public URL.
// The agent's tunnel URL can change on every restart, so the always-on wrapper
// writes the current URL into Supabase (printer_config). We prefer that dynamic
// value and fall back to the BAMBU_AGENT_URL env var.

export async function resolveAgentUrl() {
  const envUrl = (process.env.BAMBU_AGENT_URL || '').trim();
  const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const sbKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  if (sbUrl && sbKey) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 4000);
      const res = await fetch(
        `${sbUrl}/rest/v1/printer_config?id=eq.1&select=agent_url`,
        {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
          signal: c.signal,
          cache: 'no-store',
        }
      );
      clearTimeout(t);
      if (res.ok) {
        const rows = await res.json();
        const u = rows && rows[0] && (rows[0].agent_url || '').trim();
        if (u) return u;
      }
    } catch {}
  }
  return envUrl;
}
