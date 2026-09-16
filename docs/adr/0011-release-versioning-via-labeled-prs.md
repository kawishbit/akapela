# Releases are versioned by PR-labeled semver, continuing from the already-published v1.0.0

Akapela's only release so far is a manually-tagged `v1.0.0` GitHub Release, picked without reference to semver and already live: `desktop/src/update-check.ts` compares against it, and both `package.json` files had independently drifted to `0.1.0`. Rather than delete or renumber a release real installs already point at, we correct both `package.json` files to `1.0.0` and version every release after it forward from there by ordinary semver.

`.github/workflows/desktop-release.yml`'s `workflow_dispatch` bump is computed from the PRs merged since the previous tag: each PR carries one of `bump:major` / `bump:minor` / `bump:patch`, applied automatically from its Conventional Commits title (`feat:` → minor, `feat!:`/`fix!:` → major, everything else → patch) rather than requiring that discipline on every commit, and defaulting to `patch` when no label is found — including any commit landed directly on `main`, since this is a solo project only now adopting PRs. The workflow input still accepts an explicit override for whatever the label scheme gets wrong.

## Considered options

- **Jump to `2.0.0` instead of correcting to `1.0.0`.** Rejected: a version bump for a bookkeeping reason, unrelated to any actual change, is a more confusing signal in the release history than a corrected baseline.
- **Enforce Conventional Commits on every commit message.** Rejected for now: only the label at merge time needs to be right, and requiring it on every commit is a bigger habit change than the automation needs.

## Amendment: the version job opens a PR, it doesn't push to `main`

The first real run of `workflow_dispatch` failed: `main` carries a repository rule ("Changes must be made through a pull request") that a direct `git push` from the `version` job can't satisfy, `GH013` rejected it outright. Tags are unprotected — only `main`/`master`/`dev`/`prod` branches are covered by the ruleset — so only the version-bump commit needed a different path, not the tag.

The `version` job now commits the bump to a new `release/vX.Y.Z` branch and opens a PR to `main` instead of pushing directly; it does not merge it. A human merging that PR is what lands the bump — consistent with every other change to `main`, and cheap here since the ruleset requires zero approvals. A new `tag` job, triggered by that PR's merge, tags the resulting merge commit and pushes the tag directly, which is what actually fires `build`/`publish` via the existing `push: tags` trigger. Cutting a release is now `workflow_dispatch` → merge the PR it opens, two manual steps instead of one, but each is now a real repository rule that isn't going away, not a false economy of the automation.
