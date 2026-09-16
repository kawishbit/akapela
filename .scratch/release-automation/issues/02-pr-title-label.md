# 02: PR title drives the semver-bump label

**What to build:** A new workflow, `.github/workflows/pr-title.yml`, that validates a PR's title as a Conventional Commit and applies a matching `bump:major`/`bump:minor`/`bump:patch` label — so labeling for the release workflow (ticket 03) is "name the PR correctly," not a separate click.

**Status:** done

- [x] Workflow triggers on `pull_request: [opened, edited, synchronize, reopened]`.
- [x] `amannn/action-semantic-pull-request@v5` validates the title against `feat`/`fix`/`chore`/`docs`/`refactor`/`perf`/`test`/`build`/`ci` (fails the check with a clear reason if the title doesn't match).
- [x] A second step maps the title to a bump label using real Conventional Commits syntax — `!` right after the type/scope (`feat!:`, `fix(api)!:`) → major, `feat:` → minor, everything else → patch — creates the label if it doesn't exist yet (`gh label create --force`, idempotent), removes any stale `bump:*` label from a previous edit, and applies the new one. A `BREAKING CHANGE:` footer is valid Conventional Commits too but invisible to a title-only check, so it isn't detected — only the `!` form is.
- [x] **Repository token permissions confirmed working.** `default_workflow_permissions: read` at the repo level does not block this workflow's own declared `pull-requests: write`/`issues: write` — confirmed live on PR #1.
- [x] Confirmed end to end on a real PR (#1): titling it `fix: ...` applied `bump:patch` correctly. A first attempt surfaced a real bug — the label-apply step called `gh` with no checkout, so `gh` had no local git remote to infer the repository from and failed with `fatal: not a git repository`. Fixed by passing `--repo "$REPO"` explicitly to every `gh` call instead of adding a checkout step.

## Comments

Verified live rather than left for a human: PR #1 exercised this workflow twice — once with a title lacking any Conventional Commits prefix (correctly failed the `amannn/action-semantic-pull-request` check), and once after fixing the title and this workflow's `--repo` bug, which correctly applied `bump:patch`. The repository-permissions question from the first pass of this ticket is resolved: it works as GitHub's docs said it should.
