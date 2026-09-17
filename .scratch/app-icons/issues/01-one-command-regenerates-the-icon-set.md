# 01: One command regenerates the icon set from the mark

**What to build:** `pnpm icons:generate` becomes the single act that turns
`logos/logo.svg` into every derived image. It copies the mark to
`public/logo.svg`, regenerates the favicon, the apple-touch icon and the PWA
set from it, and re-exports `logos/logo.png` at a correct 1024 (the committed
one is 1000, which is under every size that wants 1024). Browser tab, PWA
install and the in-app title bar still show the mark — now verifiably derived
from it rather than coincidentally matching.

A test in the root suite fails if `public/logo.svg` ever stops matching
`logos/logo.svg`, so the hand-made copy cannot silently diverge again.
Regenerating icons is a once-a-year act nobody remembers; the script makes it
right and the test keeps it right.

The script is the prefactor the two desktop tickets hang their outputs off, so
it is written to take a list of outputs rather than hard-coding the web set.
Node 24 strips types, so it runs under plain `node` with no new dependency.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `pnpm icons:generate` writes `public/logo.svg`, the favicon, the
      apple-touch icon, the PWA set and `logos/logo.png`, and running it twice
      in a row leaves the working tree clean
- [x] Editing `public/logo.svg` by hand makes `pnpm test` fail, naming the
      command that fixes it
- [x] `logos/logo.png` is 1024 × 1024
- [x] The generated web and PWA images are visually unchanged from the
      committed ones
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass

## Comments
