# Releases are versioned by PR-labeled semver, continuing from the already-published v1.0.0

Akapela's only release so far is a manually-tagged `v1.0.0` GitHub Release, picked without reference to semver and already live: `desktop/src/update-check.ts` compares against it, and both `package.json` files had independently drifted to `0.1.0`. Rather than delete or renumber a release real installs already point at, we correct both `package.json` files to `1.0.0` and version every release after it forward from there by ordinary semver.

`.github/workflows/desktop-release.yml`'s `workflow_dispatch` bump is computed from the PRs merged since the previous tag: each PR carries one of `bump:major` / `bump:minor` / `bump:patch`, applied automatically from its Conventional Commits title (`feat:` → minor, `feat!:`/`fix!:` → major, everything else → patch) rather than requiring that discipline on every commit, and defaulting to `patch` when no label is found — including any commit landed directly on `main`, since this is a solo project only now adopting PRs. The workflow input still accepts an explicit override for whatever the label scheme gets wrong.

## Considered options

- **Jump to `2.0.0` instead of correcting to `1.0.0`.** Rejected: a version bump for a bookkeeping reason, unrelated to any actual change, is a more confusing signal in the release history than a corrected baseline.
- **Enforce Conventional Commits on every commit message.** Rejected for now: only the label at merge time needs to be right, and requiring it on every commit is a bigger habit change than the automation needs.

## Amendment: the version job opens a PR, it doesn't push to `main`

The first real run of `workflow_dispatch` failed: `main` carries a repository rule ("Changes must be made through a pull request") that a direct `git push` from the `version` job can't satisfy, `GH013` rejected it outright. Tags are unprotected — only `main`/`master`/`dev`/`prod` branches are covered by the ruleset — so only the version-bump commit needed a different path, not the tag.

The `version` job now commits the bump to a new `release/vX.Y.Z` branch and opens a PR to `main` instead of pushing directly; it does not merge it. A human merging that PR is what lands the bump — consistent with every other change to `main`, and cheap here since the ruleset requires zero approvals. A new `tag` job, triggered by that PR's merge, tags the resulting merge commit and pushes the tag directly. Cutting a release is now `workflow_dispatch` → merge the PR it opens, two manual steps instead of one, but each is now a real repository rule that isn't going away, not a false economy of the automation.

A second, separate repository setting surfaced on the next real run: GitHub Actions was disallowed from creating pull requests at all (`can_approve_pull_request_reviews: false` on the repo's Actions permissions — a different control from `default_workflow_permissions`, and not overridable by a workflow's own `permissions:` block). Fixed by enabling it via the API.

## Amendment: build and publish run off the same workflow run as tag, not off its push

The `v1.0.1` release exposed a third issue, this time in the automation's own design rather than a repository setting: the `tag` job's `git push` succeeded, but GitHub Actions deliberately does not let a push made with the default `GITHUB_TOKEN` trigger another workflow run — an anti-recursion guard, undocumented in the sense that nothing about the push itself failed or warned. `v1.0.1` ended up a real tag on a real commit with no installers built and no GitHub Release, because `build`/`publish` were waiting on a `push: tags` event that structurally could never arrive.

`build` and `publish` now run directly off the same merged-release-PR workflow run instead: `build` needs `tag` (gated with `always()` so the plain `push: tags` fallback path, where `tag`'s own condition is false, doesn't skip `build` by the usual needs-skip propagation), and `publish` reads the tag name from `tag`'s job output rather than from `github.ref_name`, which only a real tag-push event carries. `push: tags` remains as a fallback for a tag pushed by an actual human with their own credentials — which does trigger normally, since the recursion guard is specific to `GITHUB_TOKEN`.

## Amendment: bump from the higher of the tag and package.json, not the tag alone

The orphaned `v1.0.1` tag from the previous amendment's bug got deleted to let a clean `v1.0.1` be re-cut. That broke the *next* run instead: `version` computed "next after the latest tag" from git tags alone, so with `v1.0.1` gone it proposed `v1.0.1` again — except `package.json` already said `1.0.1`, from the release-bump PR that had already merged. `npm pkg set` was a no-op, there was nothing to commit, and the job failed outright.

The underlying issue is that merging the release-bump PR is what actually advances `package.json`, and that can happen without the release ever finishing (a later step fails, or — as here — the tag gets deleted to retry). `prev_version` is now the higher of the latest tag and `package.json`'s current version (compared with `sort -V`), so whichever one is ahead is what the next bump computes from.
