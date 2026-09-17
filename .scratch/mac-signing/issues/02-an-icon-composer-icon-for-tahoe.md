# 02: An Icon Composer icon for macOS 26

**What to build:** The mark rendered with macOS 26's own icon treatment —
layered, with the system applying its depth, blur and tint effects — instead
of a flat image the system masks into a squircle.

`.scratch/app-icons/` ticket 03 ships a near-full-bleed rounded square, which
is the best a flat icon can do: correct on macOS 15 and earlier, and filling
the mask correctly on 26. An Icon Composer `.icon` is what Apple actually
wants on 26, and the difference shows most under the Dark, Clear and Tinted
icon styles, where flat legacy icons are reported to be shrunk into a grey
container.

Three things gate it, which is why it is not part of the icon work:

- The mark has to be re-authored as separate layers in Icon Composer, which is
  a Mac app. `logos/logo.af` is the master to draw from; the glyph and its
  background need to become distinct layers rather than one flat shape.
- electron-builder supports `.icon` for the mac target, but compiling it
  shells out to Apple's `actool` and requires **Xcode 26 or higher** on the
  build machine. Whether `macos-latest` on GitHub Actions carries that has to
  be verified on the runner before the release depends on it — the build fails
  outright if actool is missing or older.
- It only matters once people are actually installing the Mac build, which in
  practice means after signing (ticket 01).

Keep the flat icon as the fallback for macOS 15 and earlier either way.

**Blocked by:** 01, in practice — and an Icon Composer authoring pass on a Mac.

**Status:** ready-for-human

- [ ] The mark exists as a layered Icon Composer document, committed alongside
      the other masters in `logos/`
- [ ] The release workflow's macOS runner is confirmed to carry Xcode 26+, and
      the build fails loudly rather than silently if it ever stops doing so
- [ ] A packaged macOS 26 build shows the layered icon under the Default,
      Dark, Clear and Tinted icon styles
- [ ] macOS 15 and earlier still get the flat rounded icon

## Comments
