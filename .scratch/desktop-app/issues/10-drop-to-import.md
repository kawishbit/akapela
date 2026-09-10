# 10: Drop an audio file on the window

**What to build:** The one desktop affordance worth having, and only if it is nearly free.

The app already imports uploaded files, so dropping an `mp3` onto the library window should hand that file to the same import path the file picker uses. Nothing new server-side, no new Job kind, no new state.

**This ticket is explicitly cuttable.** If it is not a small diff against the existing import UI, close it as `wontfix` and move on — it is a convenience, not a capability, and the file picker already works.

Deliberately out of scope, and not to be added quietly along the way:

- **Dropping onto the dock or taskbar icon**, which means handling a cold start that arrives with a file already in hand.
- **File associations** — "Open with Akapela" — which mean installer registry writes on Windows, `CFBundleDocumentTypes` on macOS, and that same cold-start path.

Both are real machinery for an affordance nobody has asked for.

**Blocked by:** 03 (the window)

**Status:** ready-for-agent

- [ ] Dropping a supported audio file (`mp3`, `m4a`, `wav`, `flac`, `ogg`) on the library window imports it through the existing upload path, with the same validation and the same error messages
- [ ] Dropping anything else — an unsupported file, a folder, a link — is refused with the message the upload path already gives, rather than being silently ignored
- [ ] Dropping several files at once either imports them all or refuses clearly; it does not import one and drop the rest on the floor
- [ ] Nothing on the server changes
- [ ] Dock and taskbar drops and file associations are not implemented
- [ ] If this could not be done as a small change, the ticket is closed `wontfix` with a note saying what it would have taken
