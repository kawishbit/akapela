#!/usr/bin/env bash
#
# Runs `pnpm install` in every location this repo needs it.
#
# There is no pnpm workspace here on purpose (see CLAUDE.md / ADR 0009):
# apphost/ and desktop/ each carry a several-hundred-megabyte,
# development-only dependency tree (Aspire's CLI tooling, Electron) that the
# root install -- the one the Dockerfile runs -- must never see. That means
# three independent `pnpm install`s instead of one, which is easy to forget
# after a fresh clone or a lockfile change. This script just runs all three,
# in the repo root, then apphost/, then desktop/.
#
# Usage:
#   ./z_install-all.sh [--skip-apphost] [--skip-desktop]
#
#   --skip-apphost   Skip the apphost/ install. Useful if you're not using
#                     `aspire run` and only need the app and/or desktop shell.
#   --skip-desktop    Skip the desktop/ install. Useful if you don't have the
#                     Electron toolchain set up and only need the app and/or
#                     AppHost.

set -euo pipefail

skip_apphost=0
skip_desktop=0

for arg in "$@"; do
  case "$arg" in
    --skip-apphost) skip_apphost=1 ;;
    --skip-desktop) skip_desktop=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--skip-apphost] [--skip-desktop]" >&2
      exit 1
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_in() {
  local label="$1"
  local dir="$2"

  echo "==> pnpm install ($label)"
  (cd "$dir" && pnpm install)
}

install_in "root" "$repo_root"

if [[ "$skip_apphost" -eq 0 ]]; then
  install_in "apphost/" "$repo_root/apphost"
else
  echo "==> Skipping apphost/ (--skip-apphost)"
fi

if [[ "$skip_desktop" -eq 0 ]]; then
  install_in "desktop/" "$repo_root/desktop"
else
  echo "==> Skipping desktop/ (--skip-desktop)"
fi

echo "All installs complete."
