# App icons follow the mark

Every surface that shows an Akapela icon should derive from the one mark in
`logos/`, and regenerating them should be a single command.

## Where it started

The web and the PWA already derived from the mark — `public/logo.svg` was
byte-identical to `logos/logo.svg`, and `pnpm icons:generate` produced the
favicon, the apple-touch icon and the PWA set from it. The copy was made by
hand, though, so nothing stopped the two from drifting apart.

The Desktop App derived from nothing. `desktop/electron-builder.yml` set no
`icon` anywhere and its `buildResources` directory held only the entitlements
plist, so every installer, executable, DMG and AppImage shipped the default
Electron icon, and `BrowserWindow` set no icon either.

## The mark

`logos/logo.af` is the master a human edits (Affinity). `logos/logo.svg` is
canonical for everything generated. It is a full-bleed `#87ea5c` square, 1000
× 1000, with the `a` glyph inset by a uniform ~23% on every side — measured,
not assumed: rendered at 1024 the glyph's bounding box is x 236–787, y
229–793. That margin is why the corners can be rounded without touching the
glyph.

## What macOS needs, and why it differs

macOS is the one platform that does not get the full-bleed square.

macOS 26 (Tahoe) masks app icons to a squircle itself — Apple's current
guidance says the system "applies masking to produce rounded corners", and
independent testing reports that artwork outside the squircle is clipped
under the default icon style, while icons that do not conform can be shrunk
into a grey container under the other styles. macOS 15 and earlier apply no
mask at all, so the same square renders as a hard tile.

The widely-cited "824 × 824 body, 185.4pt corner radius on a 1024 canvas" is
**not** current Apple guidance. It appears nowhere in the Human Interface
Guidelines; it is reverse-engineered from Apple's retired flat-icon
templates. Apple's only current number is the 1024 × 1024 canvas. Worse, that
inset is now counterproductive: under Tahoe's mask a body inset to 824 renders
visibly smaller than every peer icon.

So macOS gets a *near-full-bleed rounded square*: corners rounded near the
squircle's curvature, little to no inset. Tahoe clips the leftover green
invisibly and the icon fills the mask like its neighbours; on macOS 15 and
earlier it reads as a proper rounded app icon rather than a tile.

Caveat worth keeping: the Tahoe behaviour is well-corroborated by independent
testing but is not documented by Apple. Treat it as observation, not spec.

## Decisions

- `logos/logo.svg` is canonical for everything generated; `logo.af` is the
  human master; `logos/logo.png` becomes a generated 1024 export rather than a
  stale hand-export.
- `public/logo.svg` stays a copy, because it has to live under `public/` to be
  served — but the copy is made by the generator and guarded by a test, so it
  cannot drift.
- Icons are generated at the repo root and committed. The root already carries
  a rasteriser through `@vite-pwa/assets-generator`, so `desktop/` gains no
  dependency and CI needs nothing on a cold runner. Committed PNGs also show a
  wrong icon in a PR diff rather than in a shipped DMG.
- electron-builder can convert an SVG to `.icns`/`.ico` itself, cross-platform.
  We generate PNGs anyway: `logos/logo.svg` declares `width="100%"` rather than
  pixel dimensions, and a rasteriser resolving that differently would surface as
  a broken icon on a tagged release build rather than at review time.
- No ADR. Icons are trivially reversible, which fails the first test for one.
  The surprising part — why macOS differs — is recorded in comments at the two
  places that decide it, the way this repo already does in
  `pwa-assets.config.ts` and `electron-builder.yml`.
- No `CONTEXT.md` change. It is a glossary for Tracks, Takes and Mixes; an app
  icon is not domain vocabulary.

## Not in scope

Apple signing and notarization, and the Icon Composer `.icon` path, are
deferred to `.scratch/mac-signing/`. Both need an Apple Developer account that
does not exist yet, and neither can be verified until it does.
