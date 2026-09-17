# 03: The Desktop App carries a Dock-correct mark on macOS

**What to build:** A singer on macOS sees the mark in the Dock, in Finder and
on the DMG, shaped so it sits correctly among native apps: a near-full-bleed
rounded square rather than a hard tile.

`pnpm icons:generate` gains a macOS-specific output — the same mark with its
corners rounded near the squircle's curvature and transparency outside them —
and the mac target alone is pointed at it. Windows and Linux keep the
full-bleed icon from ticket 02.

The corners can be rounded without touching the glyph: the glyph is inset by a
uniform ~23% on every side, so the region a squircle removes is pure
background. That was measured rather than assumed (see `spec.md`), and the
test should hold it true, because a future edit to the mark that moves the
glyph outward would start clipping it silently.

Why macOS differs at all belongs in comments where it is decided, not in an
ADR: that macOS 26 masks legacy icons to a squircle and clips what falls
outside, that macOS 15 and earlier mask nothing, that the widely-cited 824px
inset is a retired convention Apple no longer publishes and would render
undersized under that mask, and that Icon Composer is the eventual answer
(`.scratch/mac-signing/`).

**Blocked by:** 01 (the generator is where the icon comes from)

**Status:** ready-for-agent

- [x] `pnpm icons:generate` writes a 1024 × 1024 macOS icon with rounded
      corners and transparency outside them, and running it twice leaves the
      working tree clean
- [x] A test fails if rounding the corners would clip any non-background
      pixel of the mark
- [x] Only the mac target uses it; Windows and Linux still resolve the
      full-bleed icon
- [ ] A packaged macOS build shows the mark in the Dock, in Finder and on the
      DMG, and it does not read undersized next to native apps (needs a
      packaged build on a Mac)
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass

## Comments
