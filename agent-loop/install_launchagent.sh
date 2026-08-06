#!/bin/bash
# Install the 5-minute autonomous Codex loop as a user LaunchAgent.
#
# Requires OPENCODE_API_KEY in the current environment (it is exported from
# ~/.zshrc, but launchd does not read shell profiles, so it is injected into
# the plist's EnvironmentVariables).
#
# Usage: bash agent-loop/install_launchagent.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$REPO/agent-loop/com.arena.codex-loop.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.arena.codex-loop.plist"
LABEL="com.arena.codex-loop"

if [[ -z "${OPENCODE_API_KEY:-}" ]]; then
  echo "error: OPENCODE_API_KEY is not set in this shell" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

python3 - "$PLIST_SRC" "$PLIST_DST" "$OPENCODE_API_KEY" <<'PY'
import sys

src, dst, key = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src).read()
marker = "    <key>HOME</key>"
assert marker in text, "plist marker not found"
block = "    <key>OPENCODE_API_KEY</key>\n    <string>%s</string>\n" % key
if "OPENCODE_API_KEY" not in text:
    text = text.replace(marker, block + marker)
open(dst, "w").write(text)
PY

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "installed: $PLIST_DST"
launchctl print "gui/$(id -u)/$LABEL" | head -30
