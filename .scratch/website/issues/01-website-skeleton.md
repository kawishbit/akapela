# 01: Website skeleton, in the Hallmark design

**What to build:** The Website exists and looks finished before it is complete. An Astro site that builds on its own from `site/`, producing one page: the pitch, three download buttons (Windows, macOS Apple Silicon, Linux AppImage) that each open the latest Release page on GitHub in a new tab, and a footer linking the repo and the GPL-3.0 licence. Favicon and logo come from the app's own.

The visual system is set here, because every later ticket builds on it. Run the Hallmark skill for the design pass and keep the app's colour identity — Figtree, the green accent, and the Dark and Light values the app uses. The theme follows the system, and a toggle overrides it, stored under the same key and values the app uses so the two agree. The chosen theme applies before first paint.

Leave room in the layout for what tickets 02–05 add (a primary/secondary download arrangement, the demo video and feature list, first-launch notes, the Docker section) so they drop in rather than force a redesign.

The site is isolated the way `desktop/` is: its own install from inside its folder; the root install, lint, typecheck, and test never see it. Add a short "The website" section to `CLAUDE.md` in the style of "The desktop shell" — what it is, how to run and build it, that Vercel deploys it from `site/`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A fresh install and build inside `site/` produce a static page; the dev server serves it
- [x] Root `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass and do not touch `site/`
- [x] Each download button opens `github.com/kawishbit/akapela/releases/latest` in a new tab, with no JavaScript required
- [x] The design came out of a Hallmark pass and uses the app's font, accent, and Dark/Light values
- [x] With no stored choice the page follows the system theme; the toggle switches and persists it under `akapela:theme`; a reload in either theme shows no flash of the other
- [x] Storage failures (private windows, blocked storage) fall back to the system theme rather than breaking the page
- [x] Works at phone width with no horizontal scroll; passes a basic keyboard and contrast check in both themes
- [x] No analytics or third-party requests on load
- [x] `CLAUDE.md` has a "The website" section

## Comments
