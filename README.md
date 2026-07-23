# TagBooks

Business tracker for Jack and Jackson: NFC review-tag kits, websites, and digital menus.
Next.js (App Router) + Supabase. Phones-first. Runs on port 3003.

## Setup

1. **Create a Supabase project** (free tier) at https://supabase.com.

2. **Run the schema.** In the Supabase dashboard: SQL Editor -> New query -> paste the contents of `supabase.sql` -> Run.
   If you already ran `supabase.sql` before the clients update, run `migration-clients.sql` instead.

3. **Disable email confirmations** so the two partners can sign up instantly:
   Authentication -> Providers -> Email -> turn off "Confirm email" -> Save.

4. **Add your keys.** Copy `.env.local.example` to `.env.local` and fill in the two values
   from Supabase (Project Settings -> API):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

5. **Run it.**

   ```
   npm install && npm run dev
   ```

   Open http://localhost:3003, use "Create account" on the login screen to make
   your two accounts (Jack and Jackson), then sign in.

6. **Deploy.** Push the repo to GitHub, import it in Vercel, set the same two env vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project
   settings, then deploy.

## Troubleshooting

**Data empty or auth errors?** Check `.env.local` (and the Vercel env vars) hold the correct
URL and anon key, and confirm `supabase.sql` ran so the tables and RLS policies exist. Data is
shared across all logged-in users; if a query returns nothing, the policies or env vars are the
usual cause.
