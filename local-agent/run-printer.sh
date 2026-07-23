#!/bin/bash
# TagBooks printer supervisor. Keeps the agent + a public tunnel alive and
# registers the current tunnel URL in Supabase so the web app always finds it,
# even though the quick-tunnel URL changes on each restart.
# Meant to be launched (and kept alive) by a LaunchAgent so it survives reboots.

export PATH=/opt/homebrew/bin:/opt/homebrew/share/google-cloud-sdk/bin:/usr/local/bin:/usr/bin:/bin
REPO="/Users/jackbonke/projects/tagbooks"
LOG="$HOME/.tagbooks-printer.log"
SB_URL="https://noildgtslvubjkifcifm.supabase.co"
SB_KEY="sb_publishable_n9re43hcpJVeMl-rIUeSYA_U0ldjDSm"

cd "$REPO" || exit 1

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

update_url() {
  curl -s -X PATCH "$SB_URL/rest/v1/printer_config?id=eq.1" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"agent_url\":\"$1\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >/dev/null
}

start_agent() {
  pgrep -f "local-agent/server.js" >/dev/null && return
  log "starting agent"
  nohup node "$REPO/local-agent/server.js" >> "$LOG" 2>&1 &
  sleep 3
}

log "supervisor start"
start_agent

while true; do
  TUNLOG="$(mktemp)"
  cloudflared tunnel --url http://localhost:4477 --no-autoupdate > "$TUNLOG" 2>&1 &
  CFPID=$!

  URL=""
  for i in $(seq 1 40); do
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNLOG" | head -1)"
    [ -n "$URL" ] && break
    sleep 1
  done

  if [ -n "$URL" ]; then
    log "tunnel up: $URL"
    update_url "$URL"
  else
    log "tunnel URL not found; retrying"
  fi

  start_agent
  wait "$CFPID"           # block until the tunnel dies
  log "tunnel exited; restarting in 3s"
  rm -f "$TUNLOG"
  sleep 3
done
