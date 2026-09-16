# Releases are versioned by PR-labeled semver, continuing from the already-published v1.0.0

Akapela's only release so far is a manually-tagged `v1.0.0` GitHub Release, picked without reference to semver and already live: `desktop/src/update-check.ts` compares against it, and both `package.json` files had independently drifted to `0.1.0`. Rather than delete or renumber a release real installs already point at, we correct both `package.json` files to `1.0.0` and version every release after it forward from there by ordinary semver.

`.github/workflows/desktop-release.yml`'s `workflow_dispatch` bump is computed from the PRs merged since the previous tag: each PR carries one of `bump:major` / `bump:minor` / `bump:patch`, applied automatically from its Conventional Commits title (`feat:` → minor, `feat!:`/`fix!:` → major, everything else → patch) rather than requiring that discipline on every commit, and defaulting to `patch` when no label is found — including any commit landed directly on `main`, since this is a solo project only now adopting PRs. The workflow input still accepts an explicit override for whatever the label scheme gets wrong.

## Considered options

- **Jump to `2.0.0` instead of correcting to `1.0.0`.** Rejected: a version bump for a bookkeeping reason, unrelated to any actual change, is a more confusing signal in the release history than a corrected baseline.
- **Enforce Conventional Commits on every commit message.** Rejected for now: only the label at merge time needs to be right, and requiring it on every commit is a bigger habit change than the automation needs.
