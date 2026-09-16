#!/usr/bin/env bash
#
# Runs the Akapela desktop app against a live, hot-reloading dev server --
# the two-terminal loop from CLAUDE.md/README.md, collapsed into one.
#
# Starts `pnpm dev` (the root Nuxt app) in the background, waits for it to
# report which port it actually bound to (it shifts if something else
# already holds 3000), then runs the desktop shell in the foreground with
# AKAPELA_SERVER_URL pointed at it. Hot reload on the Nuxt side still works
# exactly as it does in the two-terminal version.
#
# Closing the desktop window (or Ctrl+C) stops the background dev server
# too, so nothing is left running behind you.
#
# Usage:
#   ./z_dev-desktop.sh [--skip-install] [--timeout-seconds N]
#
#   --skip-install         Skip `pnpm install` in desktop/ before starting
#                           it. Useful once you know it's already up to
#                           date -- the script otherwise always runs it,
#                           since it's a fast no-op when nothing changed.
#   --timeout-seconds N    How long to wait for the dev server to report
#                           its port before giving up. Default: 30.

set -euo pipefail

skip_install=0
timeout_seconds=30

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) skip_install=1; shift ;;
    --timeout-seconds)
      timeout_seconds="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--skip-install] [--timeout-seconds N]" >&2
      exit 1
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
desktop_dir="$repo_root/desktop"
stamp="$(date +%s)-$$"
out_log="${TMPDIR:-/tmp}/akapela-dev-server-$stamp.out.log"
err_log="${TMPDIR:-/tmp}/akapela-dev-server-$stamp.err.log"

dev_pid=""

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "$dev_pid" ]] && kill -0 "$dev_pid" 2>/dev/null; then
    echo "Stopping the dev server (pid $dev_pid)..."
    kill_tree "$dev_pid"
  fi
  rm -f "$out_log" "$err_log"
}
trap cleanup EXIT

echo "Starting the Nuxt dev server..."
(cd "$repo_root" && pnpm dev >"$out_log" 2>"$err_log") &
dev_pid=$!

port=""
deadline=$((SECONDS + timeout_seconds))
while [[ $SECONDS -lt $deadline ]]; do
  if [[ -f "$out_log" ]]; then
    if [[ "$(cat "$out_log")" =~ localhost:([0-9]+) ]]; then
      port="${BASH_REMATCH[1]}"
      break
    fi
  fi
  if ! kill -0 "$dev_pid" 2>/dev/null; then
    cat "$out_log" "$err_log" 2>/dev/null || true
    echo "The dev server exited before it started listening -- see the output above." >&2
    exit 1
  fi
  sleep 0.3
done

if [[ -z "$port" ]]; then
  echo "Timed out after ${timeout_seconds}s waiting for the dev server to report its port. Check $out_log." >&2
  exit 1
fi

echo "Dev server is up on http://localhost:$port"

cd "$desktop_dir"
if [[ "$skip_install" -eq 0 ]]; then
  pnpm install
fi
AKAPELA_SERVER_URL="http://localhost:$port" pnpm run dev
