# 08: Where the library lives, and moving it

**What to build:** A default that works without asking, and a way to change it that does not pretend to be a file manager.

The default is `app.getPath('userData')/data` — no first-run prompt, no wizard, straight onto an empty library screen. This is just ticket 04's `NUXT_DATA_DIR`, so there is no new concept in the server.

Changing it is a **pointer change, not a move**. Choose a folder, restart, done. A library is potentially tens of gigabytes across drives; moving it needs progress, cancellation, partial-failure recovery, and an answer for "the target already has an `akapela.db`" — a lot of machinery for something the operating system's own file manager does better. Pointing is also the *more useful* operation: it is how someone opens the library their compose instance already built, which is the fourth user story in the spec. Someone who genuinely wants the files moved closes the app, moves the folder, and points at it — the same thing the README already tells compose users to do.

Restart-to-apply is honest rather than lazy. The database handle is opened and the migrations run at startup (`server/lib/akapela.ts`), so a running process cannot change its mind about which directory it is serving. Ticket 04 already made Electron capable of restarting the server, so this reuses that rather than adding anything.

**Blocked by:** 04 (the supervisor, and the restart it makes possible)

**Status:** ready-for-agent

- [ ] With nothing configured, the library lives at `app.getPath('userData')/data` and the app opens straight onto it
- [ ] Settings shows the current library location and offers a native folder picker to change it, shown only when running as the desktop app
- [ ] Choosing a folder stores it in Electron's own config and restarts the server against it; the window comes back on the new library on its own
- [ ] Pointing at a folder a compose instance built opens that library intact, with its Tracks, Takes, Mixes, and cached separation model — verified by actually doing it
- [ ] Pointing at an empty folder creates a fresh library there, the same way a first run does
- [ ] A folder that cannot be written to reports that before the restart, not after, so the app cannot be left pointing at somewhere it cannot use
- [ ] Nothing is moved, copied, or deleted at the old location; the wording in Settings makes it plain that this changes which library is open rather than relocating anything
