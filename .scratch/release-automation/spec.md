# Spec: Manually-triggered, auto-versioned desktop releases

Status: ready-for-human

## Issues

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Correct the version baseline](issues/01-version-baseline.md) | done | — |
| 02 | [PR title drives the semver-bump label](issues/02-pr-title-label.md) | done | — |
| 03 | [workflow_dispatch cuts a release](issues/03-workflow-dispatch-release.md) | ready-for-human | 01, 02 |

01 and 02 are verified live on PR #1 — including catching and fixing a real bug in `pr-title.yml` (a missing `--repo` flag). 03 has taken two real, live failures to get right: `main` is rule-protected (`GH013`, "Changes must be made through a pull request"), fixed by having the `version` job open a PR instead of pushing (ADR 0011's amendment); then GitHub Actions itself was disallowed from creating PRs at all (a separate repo setting, `can_approve_pull_request_reviews`), fixed by enabling it. `release/v1.0.1`'s PR (#3) was opened by hand to avoid wasting that run. What's left: dispatch once more (or just merge #3) to confirm the whole chain — tag → build → publish — now runs unattended.

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
