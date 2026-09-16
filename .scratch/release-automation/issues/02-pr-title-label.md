# 02: PR title drives the semver-bump label

**What to build:** A new workflow, `.github/workflows/pr-title.yml`, that validates a PR's title as a Conventional Commit and applies a matching `bump:major`/`bump:minor`/`bump:patch` label — so labeling for the release workflow (ticket 03) is "name the PR correctly," not a separate click.

**Status:** ready-for-human

- [x] Workflow triggers on `pull_request: [opened, edited, synchronize, reopened]`.
- [x] `amannn/action-semantic-pull-request@v5` validates the title against `feat`/`fix`/`chore`/`docs`/`refactor`/`perf`/`test`/`build`/`ci` (fails the check with a clear reason if the title doesn't match).
- [x] A second step maps the title to a bump label using real Conventional Commits syntax — `!` right after the type/scope (`feat!:`, `fix(api)!:`) → major, `feat:` → minor, everything else → patch — creates the label if it doesn't exist yet (`gh label create --force`, idempotent), removes any stale `bump:*` label from a previous edit, and applies the new one. A `BREAKING CHANGE:` footer is valid Conventional Commits too but invisible to a title-only check, so it isn't detected — only the `!` form is.
- [ ] **Verify repository token permissions.** `gh api repos/{owner}/{repo}/actions/permissions/workflow` currently returns `"default_workflow_permissions": "read"` for this repo. This workflow declares its own `permissions: pull-requests: write, issues: write`, which — per GitHub's docs — should be honored regardless of the repository default (the default only applies to workflows that don't declare `permissions` themselves), but this has **not been verified against this specific repository's actual behavior**, only read from docs. The cheapest way to confirm: open a real PR titled e.g. `feat: test the labeler` and watch whether the `bump:minor` label actually gets applied. If it silently fails, the fix is `Settings → Actions → General → Workflow permissions → Read and write permissions`.
- [ ] Open one real PR to confirm the label is applied end to end. Not done from here — needs an actual PR against GitHub, not something a local check can simulate.

## Comments

Not done from here, and can't be: anything requiring an actual pull request against `kawishbit/akapela`, or a change to the repository's Actions settings, needs a human with write access to the repo. The workflow file itself is written and YAML-reviewed (no `yaml`/`js-yaml` parser was available locally to lint it programmatically — reviewed by eye instead, twice).
