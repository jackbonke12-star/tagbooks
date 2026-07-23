# TagBooks

Business tracker for Jack and Jackson: NFC review-tag kits, websites, and digital menus.
Next.js (App Router) + Supabase. Phones-first. Runs on port 3003.

## Setup

1. **Create a Supabase project** (free tier) at https://supabase.com.

2. **Run the schema.** In the Supabase dashboard: SQL Editor -> New query -> paste the contents of `supabase.sql` -> Run.
   If you already ran `supabase.sql` before the clients update, run `migration-clients.sql` instead.
   If your database already ran `supabase.sql`/`migration-clients.sql`, run `migration-phase2.sql` to add inventory, print queue, and recurring.
   For live cross-device updates, run `migration-realtime.sql` (already included at the end of `supabase.sql` for fresh setups) to add the tables to the `supabase_realtime` publication.
   If your database predates the Google review link on clients, run `migration-review-link.sql` to add the `google_review_url` column (already included in `supabase.sql`/`migration-clients.sql` for fresh setups).
   To add the in-app App Requests board (partners submit change/feature requests, Jack relays them), run `migration-requests.sql` (already included in `supabase.sql` for fresh setups).
   To add the Places door-to-door prospecting list (NW Calgary businesses to pitch), run `migration-prospects.sql` (already included in `supabase.sql` for fresh setups).

3. **Add your keys.** Copy `.env.local.example` to `.env.local` and fill in the two values
   from Supabase (Project Settings -> API):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. **Run it.**

   ```
   npm install && npm run dev
   ```

   Open http://localhost:3003 - it goes straight to the dashboard, no login.

5. **Deploy.** Push the repo to GitHub, import it in Vercel, set the same two env vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project
   settings, then deploy.

## 3D Printer

The `/printer` page shows live Bambu Lab printer status (state, progress, temps)
and Pause / Resume / Stop controls, plus a reference filament list.

The printer sits on the home LAN, which Vercel cannot reach. A small **local
agent** (`local-agent/`) runs on the Mac that shares the printer's network,
talks to the printer over MQTT + FTPS, and is exposed to the internet through a
tunnel. The Vercel route handlers under `app/api/printer/` call that tunnel URL
server-side with a shared secret, so the browser never holds any credentials.

1. **Run the agent on the Mac.** See `local-agent/README.md`. In short: the env
   is at `local-agent/.env` (gitignored, holds the real printer creds + shared
   secret), then `node local-agent/server.js`.

2. **Expose it with a tunnel** to get a public URL, e.g.
   `cloudflared tunnel --url http://localhost:4477` or
   `npx localtunnel --port 4477`.

3. **Set the Vercel env vars** (Project Settings -> Environment Variables):

   - `BAMBU_AGENT_URL` = the tunnel URL
   - `BAMBU_AGENT_SECRET` = the same string as the agent's `AGENT_SHARED_SECRET`

   Both are **required** for the `/printer` page to connect. With them blank the
   page renders a calm "Printer not connected yet" setup card instead of erroring.

## Troubleshooting

**Data empty?** Check `.env.local` (and the Vercel env vars) hold the correct URL and anon key,
and confirm `supabase.sql` ran so the tables and RLS policies exist. If a query returns nothing,
the policies or env vars are the usual cause.

**Open access, no login.** This app has no authentication - it reads and writes with the public
anon key and RLS policies allow the `anon` role. That is fine on your own machine. If you deploy
it to a public URL, anyone who finds that URL can view and edit all data. Keep it private (local
only, or a Vercel deploy behind Vercel password protection) unless you add auth back.
