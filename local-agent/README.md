# TagBooks Printer Agent

A tiny local server that bridges the TagBooks (Vercel) app to a Bambu Lab
printer on your home LAN. Vercel cannot reach `10.0.0.214`, so this agent runs
on the Mac that shares the printer's network, and you expose it through a public
tunnel URL. The Vercel route handlers call that URL server-side with a shared
secret, so the browser never sees any printer credentials.

It talks to the printer over MQTT (status + pause/resume/stop) and FTPS
(file upload), and serves a small HTTP API guarded by `x-agent-secret`.

## Setup

1. Env is already created at `local-agent/.env` (gitignored). For a fresh
   machine: `cp .env.example .env` and fill in the real values.

   - `BAMBU_HOST` - printer LAN IP (e.g. `10.0.0.214`)
   - `BAMBU_SERIAL` - printer serial number
   - `BAMBU_ACCESS_CODE` - LAN access code (printer screen: Settings -> WLAN)
   - `AGENT_SHARED_SECRET` - a long random string; must match the Vercel
     `BAMBU_AGENT_SECRET` env var
   - `AGENT_PORT` - defaults to `4477`

2. Run it (uses the repo root `node_modules`, so no install needed):

   ```
   node local-agent/server.js
   # or, from inside local-agent/
   npm start
   ```

   The printer must be reachable on the LAN and in LAN / developer mode.

## Exposing it to Vercel

Start a tunnel to `http://localhost:4477` to get a public URL, e.g.:

```
cloudflared tunnel --url http://localhost:4477
# or
npx localtunnel --port 4477
```

Then in the Vercel project settings set:

- `BAMBU_AGENT_URL` = the tunnel URL (e.g. `https://something.trycloudflare.com`)
- `BAMBU_AGENT_SECRET` = the same value as `AGENT_SHARED_SECRET` above

The TagBooks `/printer` page connects once both env vars are set and the agent
is running.

## API (all require header `x-agent-secret`)

- `GET /health` -> `{ ok, connected }`
- `GET /status` -> friendly status subset + `raw`
- `POST /control` `{ action: 'pause' | 'resume' | 'stop' }`
- `POST /upload` (multipart `file`) -> FTPS-uploads a `.3mf`/`.gcode` to the
  printer. Starting the print from the uploaded file is left as a TODO stub in
  `server.js` (model-specific command).
