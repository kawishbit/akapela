# 04: Cut v1.0.2 end to end

**What to build:** The first real Release from the automated pipeline:
1. Dispatching the Desktop release workflow opens a `release/v1.0.2` PR.
2. Merging it runs tag, build, and publish in that single workflow run.
3. A GitHub Release `v1.0.2` appears, carrying the Windows, Linux, and Apple Silicon installers, their checksums, and release notes generated from the changes since `v1.0.0`.
4. The Desktop App's update check sees the new Release.

It also clears out the leftovers that caused earlier failures. The stale `release/v1.0.1` and `release/v1.0.2` branches are removed, and merged branches are deleted automatically from now on, so a leftover branch can't reject a release push again.

This needs a human: merging to `main` and publishing a Release are real, visible actions.

**Blocked by:** 03

**Status:** ready-for-human

- [ ] Dispatch with a blank version proposes `v1.0.2` and opens its release PR with no manual rescue
- [ ] Merging that PR tags the merge commit `v1.0.2`, builds all three installers, and publishes the Release in the same workflow run
- [ ] The `v1.0.2` Release lists all three installers and their `.sha256` files, with generated notes
- [ ] An installed Desktop App on `1.0.0` or `1.0.1` shows the update notice pointing at `v1.0.2`
- [ ] The stale release branches are gone, and the repository deletes branches on merge
- [ ] Each installer is opened once on its platform: the library screen appears, and a Mix with a pitch Adjustment renders
