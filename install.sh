#!/usr/bin/env sh
# Astra DB for AI agents — one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/jestatsio/astra-db-plugin/main/install.sh | sh
#   curl -fsSL …/install.sh | sh -s -- --agents claude-code,cursor --yes
#
# Runs `npx @erichare/astra-mcp init` (detects your agents, installs the
# plugin/MCP config, then connects a database). Needs Node.js 20+.
set -eu

PACKAGE="@erichare/astra-mcp@2"

say() { printf '%s\n' "$*"; }

if ! command -v node >/dev/null 2>&1; then
  say "astra-db: Node.js 20+ is required (https://nodejs.org), then re-run:"
  say "  npx -y $PACKAGE init"
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$major" -lt 20 ]; then
  say "astra-db: Node.js $major found; 20 or newer is required (https://nodejs.org)."
  exit 1
fi

# Prompts need a terminal even when this script arrives through a pipe.
if [ -t 0 ]; then
  exec npx -y "$PACKAGE" init "$@"
elif [ -r /dev/tty ]; then
  exec npx -y "$PACKAGE" init "$@" </dev/tty
else
  exec npx -y "$PACKAGE" init --yes "$@"
fi
