# 03: A dry run builds all three installers, and the pipeline fixes land

**What to build:** Running the Desktop release workflow by hand with `dry_run` produces a Windows installer, a Linux AppImage, and an Apple Silicon DMG, each with a checksum, from one run. It versions, tags, and publishes nothing. Then the release pipeline's accumulated fixes reach `main` through a single Conventional Commits PR.

Those fixes are already written and partly proven by earlier dry runs, where Windows and Linux built installers:
- One `@types/node` for the whole dependency tree, which was breaking `pnpm typecheck`.
- The separation CLI's dependencies installed with the pnpm version they pin.
- Lint, typecheck, and tests run once, in their own job.
- The `dry_run` input.
- The version job replacing a stale release branch and reusing an open release PR.
- The tag job re-runnable against the exact merge commit.
- Empty signing variables unset before the macOS build.

This ticket is where macOS joins them and the whole set is proven together.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A `dry_run` dispatch completes with `checks` and all three build legs green, and uploads all three installers with `.sha256` files
- [ ] `version`, `tag`, and `publish` are skipped on a dry run; nothing new appears in tags, branches, or releases
- [ ] The branch merges to `main` through a PR whose title passes the PR title check
- [x] The README tells a Mac user how to open the unsigned Apple Silicon build, which macOS refuses as "damaged" until its quarantine flag is cleared
- [x] ADR 0011 and the release-automation tickets record what the dry runs found and how each was fixed

## Comments

**Written, not yet run on GitHub.** Nothing here has been pushed or dispatched. Pushing the branch, dispatching a workflow, and opening a PR are visible actions, so they are left for a human to do or approve.

Done on the branch:
- README: an Apple Silicon Mac user is told the app is unsigned, that macOS will call it "damaged", and to run `xattr -dr com.apple.quarantine /Applications/Akapela.app` once. The comment in `electron-builder.yml` no longer claims right-click → Open gets past it.
- ADR 0011's fourth amendment records the `dry_run` input and each thing the dry runs found, with its fix: `@types/node`, the `checks` job, pinned pnpm for the separation CLI, empty signing variables, and macOS ffmpeg. The two release-path fixes landed in the same batch are recorded there too. Release-automation ticket 03 points at it.

Left, in order:
1. `git push -u origin fix/release-pipeline-end-to-end`
2. `gh workflow run desktop-release.yml --ref fix/release-pipeline-end-to-end -f dry_run=true`. The macOS leg's new "Check the macOS ffmpeg" step is the first time the pinned arm64 build runs on a Mac.
3. Confirm `checks` and all three `build` legs are green. Confirm the run's artifacts hold a `.exe`, a `.dmg`, and an `.AppImage`, each with a `.sha256`. Confirm `version`, `tag`, and `publish` were skipped.
4. Open the PR, e.g. `gh pr create --base main --title "fix(release): build all three installers, Apple Silicon included"`, and merge it once the PR title check passes.
