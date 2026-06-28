#!/usr/bin/env bash
set -euo pipefail

TCPDUMP_PATH="${TCPDUMP_PATH:-$(command -v tcpdump)}"

if [[ -z "$TCPDUMP_PATH" ]]; then
  echo "tcpdump not found. Install it first:"
  echo "  Arch:   sudo pacman -S tcpdump"
  echo "  Debian: sudo apt install tcpdump"
  exit 1
fi

echo "Granting packet capture capabilities to: $TCPDUMP_PATH"
sudo setcap cap_net_raw,cap_net_admin=eip "$TCPDUMP_PATH"
getcap "$TCPDUMP_PATH"
echo ""
echo "Done. Restart the dev server, then click Start Capture."