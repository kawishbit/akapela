# Spec: Manually-triggered, auto-versioned desktop releases

Status: ready-for-human

## Issues

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Correct the version baseline](issues/01-version-baseline.md) | done | — |
| 02 | [PR title drives the semver-bump label](issues/02-pr-title-label.md) | ready-for-human | — |
| 03 | [workflow_dispatch cuts a release](issues/03-workflow-dispatch-release.md) | ready-for-human | 01, 02 |

Everything is written and passes local validation (YAML review, `pnpm lint`/`typecheck`/`test`). What's left is entirely things only a human with repo-admin access can do: check/change a repository setting, and actually run the workflow once to watch it work end to end. See ADR 0011 for the reasoning behind the version/labeling scheme.

## Problem Statement

The only release workflow (`desktop-release.yml`) was tag-push-only: cutting a release meant pushing a tag by hand with no help deciding the next version number. The user wanted a manual, `workflow_dispatch`-triggered release that takes a version, auto-bumps it from the changes since the previous release where possible, builds Windows/macOS/Linux installers (already existed), and fills in the release description from the diff (already existed via `generate_release_notes: true`).

## Solution

Settled during a grilling session (see project chat) and recorded in ADR 0011:

- Extend `desktop-release.yml` in place rather than duplicating its build matrix in a new file.
- Correct both `package.json` files to `1.0.0` to match the already-published `v1.0.0` GitHub Release, then bump forward by ordinary semver.
- The bump level comes from `bump:major`/`bump:minor`/`bump:patch` labels on PRs merged since the previous tag (highest wins, defaults to `patch`), applied automatically from the PR's Conventional Commits title (`feat:` → minor, `feat!:`/`fix!:` → major, everything else → patch) so labeling isn't a separate step to remember.
- `workflow_dispatch`'s `version` input can still override the computed result with an explicit `X.Y.Z`, or force a `major`/`minor`/`patch` bump.
- Release notes and source-code archives were already covered by GitHub's own release machinery; signing/notarization is untouched and out of scope (needs a paid Apple Developer account and a Windows cert, a business decision, not a workflow change).
