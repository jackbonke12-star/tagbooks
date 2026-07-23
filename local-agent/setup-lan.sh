#!/bin/bash
# TagBooks printer agent - LAN setup.
# RUN THIS ON THE COMPUTER THAT IS ON THE SAME WIFI AS THE PRINTER (Jackson's Mac).
# It installs what's needed, asks for the printer's IP + access code, and starts
# the agent + tunnel so the app can print to the printer over the local network.

set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root
echo "=== TagBooks printer LAN setup ==="

# 1. Node
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org (LTS), then re-run this."
  exit 1
fi

# 2. cloudflared (the tunnel) - install via Homebrew on macOS if missing
if ! command -v cloudflared >/dev/null 2>&1 && ! [ -x /opt/homebrew/bin/cloudflared ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing cloudflared (tunnel)..."
    brew install --cask cloudflared || brew install cloudflared || true
  else
    echo "Please install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    echo "(on Mac: install Homebrew from https://brew.sh then run: brew install cloudflared)"
    exit 1
  fi
fi

# 3. dependencies
echo "Installing dependencies (one time, ~1 min)..."
npm install >/dev/null 2>&1 || npm install

# 4. printer details
echo ""
echo "On the printer screen, open Settings and find the LAN section:"
echo "  - the printer's IP address (e.g. 192.168.1.42)"
echo "  - the Access Code (a number shown next to it)"
echo ""
read -r -p "Printer IP address: " PHOST
read -r -p "Printer Access Code: " PCODE
read -r -p "Shared secret (ask Jack for this): " PSECRET

cat > local-agent/.env <<EOF
BAMBU_MODE=lan
BAMBU_HOST=$PHOST
BAMBU_ACCESS_CODE=$PCODE
BAMBU_SERIAL=01P09C460800075
AGENT_SHARED_SECRET=$PSECRET
AGENT_PORT=4477
EOF
echo "Saved local-agent/.env"

# 5. persistence via LaunchAgent (macOS) + start now
PLIST="$HOME/Library/LaunchAgents/com.tagbooks.printer.plist"
if [ -d "$HOME/Library/LaunchAgents" ]; then
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.tagbooks.printer</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>$(pwd)/local-agent/run-printer.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/.tagbooks-printer.out</string>
  <key>StandardErrorPath</key><string>$HOME/.tagbooks-printer.err</string>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "Installed auto-start (survives reboots)."
else
  chmod +x local-agent/run-printer.sh
  nohup bash local-agent/run-printer.sh >/dev/null 2>&1 &
  echo "Started the agent (no auto-start on this OS)."
fi

echo ""
echo "=== Done. Give it ~30 seconds, then open the Printer tab in the app. ==="
echo "It should show connected. Send a sliced .3mf and it will print."
