# 02: Keep the Sing screen clear of the title bar and the window's bottom edge

**What to build:** In the Desktop App, the Sing screen starts below Akapela's title bar instead of underneath it. The line under the Song name that shows pitch, tempo, Backing Source and Lyrics is fully visible and clickable. The transport controls at the bottom have comfortable padding from the window edge, and no longer sit tight against it.

The cause: the Sing screen takes up the whole viewport, while the app shell puts the title bar in its own row above the page. So the screen's header ends up under the bar. The title bar's height and layout differ by platform: Windows and Linux draw their own window controls, and on macOS the native traffic lights sit inside the bar. The fix has to account for all three, not just one fixed offset. In a browser there is no title bar, and the Sing screen keeps its top as it is; the extra bottom padding applies there too, including the safe-area inset on phones with a home indicator.

Follow DESIGN.md's spacing scale rather than adding one-off values.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] In the Desktop App on Windows/Linux, the Sing screen header (back button, Song name, pitch/tempo line) sits fully below the title bar and nothing overlaps it
- [x] The same holds on macOS, with the traffic lights clear of the header
- [x] The bottom transport controls have clearly more space from the window's bottom edge than today, in the Desktop App and in a browser, and respect the bottom safe-area inset on mobile
- [x] Lyrics still fill the space between header and controls, and the window itself doesn't scroll
- [x] The Sing screen in a browser (no title bar) has no gap at the top

## Comments

**Implemented.** In the Desktop App the Sing screen is `absolute inset-0` inside the scroll area below the title bar, and `app.vue` makes that area `relative`. It fills exactly the space under the bar on every platform, including macOS where the traffic lights sit inside the bar, and needs no hard-coded bar height. In a browser it is still `fixed inset-0`. The header's top padding went from `pt-3`/`sm:pt-4` to `pt-4`/`sm:pt-6`. The footer's bottom padding is now `max(0.5rem, safe-area-inset-bottom) + 1.5rem`, where it was `max(1rem, safe-area-inset-bottom)`.

**Not verified by eye:** the browser automation couldn't open the local dev server, and the desktop layout only shows up inside the Electron shell. Worth a look with `AKAPELA_SERVER_URL=… pnpm dev` in `desktop/` on Windows and macOS.
