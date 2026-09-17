# 02: The Desktop App carries the mark on Windows and Linux

**What to build:** A singer who installs Akapela sees the mark on the
executable, in the NSIS installer, on the AppImage, in the taskbar and on the
running window — instead of the default Electron atom, which is what every
build has shipped so far.

`pnpm icons:generate` gains the full-bleed desktop icon as an output, written
at 1024 into the directory electron-builder already reads as its build
resources, so it is picked up without a new config key.

Linux also needs the icon set explicitly on the window. Windows takes it from
the executable and macOS from the bundle, but a Linux window and its taskbar
entry fall back to the default even when the AppImage itself is branded. That
rule belongs with the other plain functions in `desktop/` that the root vitest
suite covers, not buried in window construction (ADR 0009).

**Blocked by:** 01 (the generator is where the icon comes from)

**Status:** ready-for-agent

- [x] `pnpm icons:generate` writes a 1024 × 1024 full-bleed desktop icon, and
      running it twice leaves the working tree clean
- [ ] A packaged Windows build shows the mark on the installer, the executable
      and the taskbar (needs a packaged build)
- [ ] A packaged Linux AppImage shows the mark on the running window and its
      taskbar entry (needs a packaged build)
- [x] The rule for when a window icon is set is a plain function with no
      Electron import, covered by the root vitest suite
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, at the root and in
      `desktop/`

## Comments
