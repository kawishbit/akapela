# Spec: Manually-triggered, auto-versioned desktop releases

Status: ready-for-human

## Issues

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Correct the version baseline](issues/01-version-baseline.md) | done | — |
| 02 | [PR title drives the semver-bump label](issues/02-pr-title-label.md) | done | — |
| 03 | [workflow_dispatch cuts a release](issues/03-workflow-dispatch-release.md) | ready-for-human | 01, 02 |

01 and 02 are verified live on PR #1 — including catching and fixing a real bug in `pr-title.yml` (a missing `--repo` flag). 03's first real run surfaced a bigger one: `main` is rule-protected (`GH013`, "Changes must be made through a pull request"), so the `version` job's direct push was always going to fail — fixed by having it open a PR instead, with a new `tag` job that tags the PR's merge commit (see ADR 0011's amendment). What's left needs a human: `workflow_dispatch` once more, then merging the release PR it opens, to watch the full chain work end to end.

## Problem Statement

The only release workflow (`desktop-release.yml`) was tag-push-only: cutting a release meant pushing a tag by hand with no help deciding the next version number. The user wanted a manual, `workflow_dispatch`-triggered release that takes a version, auto-bumps it from the changes since the previous release where possible, builds Windows/macOS/Linux installers (already existed), and fills in the release description from the diff (already existed via `generate_release_notes: true`).

## Solution

Settled during a grilling session (see project chat) and recorded in ADR 0011:

- Extend `desktop-release.yml` in place rather than duplicating its build matrix in a new file.
- Correct both `package.json` files to `1.0.0` to match the already-published `v1.0.0` GitHub Release, then bump forward by ordinary semver.
- The bump level comes from `bump:major`/`bump:minor`/`bump:patch` labels on PRs merged since the previous tag (highest wins, defaults to `patch`), applied automatically from the PR's Conventional Commits title (`feat:` → minor, `feat!:`/`fix!:` → major, everything else → patch) so labeling isn't a separate step to remember.
- `workflow_dispatch`'s `version` input can still override the computed result with an explicit `X.Y.Z`, or force a `major`/`minor`/`patch` bump.
- `main` requires every change go through a PR (a repository rule, found the hard way), so `workflow_dispatch` opens a `release/vX.Y.Z` PR with the version bump rather than pushing it — merging that PR is what lands it. A `tag` job then tags the merge commit and pushes the tag, which is what actually fires `build`/`publish`.
- Release notes and source-code archives were already covered by GitHub's own release machinery; signing/notarization is untouched and out of scope (needs a paid Apple Developer account and a Windows cert, a business decision, not a workflow change).
