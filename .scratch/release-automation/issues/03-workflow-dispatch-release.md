# 03: workflow_dispatch cuts a release

**What to build:** A `version` job in `desktop-release.yml`, gated to `workflow_dispatch` only, that computes (or accepts an override for) the next semver, opens a PR with both `package.json` files bumped, and — once that PR is merged — a `tag` job that tags the merge commit and pushes it, which re-triggers the same workflow's existing `build`/`publish` jobs via the `push: tags` trigger, unchanged.

**Blocked by:** 01 (needs the corrected baseline to bump forward from), 02 (needs the label scheme populated to auto-detect from)

**Status:** ready-for-human

- [x] `workflow_dispatch.inputs.version` accepts blank (auto), `major`/`minor`/`patch` (forced bump), or an explicit `X.Y.Z` (full override).
- [x] Auto mode reads `gh pr list --state merged --search "merged:>$SINCE"` since the previous tag's commit date, takes the highest-precedence `bump:*` label found, defaults to `patch` (covers both an unlabeled PR and a commit landed directly on `main`).
- [x] `build` gated to `if: github.event_name == 'push'` — it and `publish` are skipped on the `workflow_dispatch` and `pull_request` runs, and only run on the tag-push event the `tag` job produces. This is a **behavior change**: previously `workflow_dispatch` also ran `build` (without publishing) as an ad-hoc "test the build" trigger. That capability is gone; `workflow_dispatch` now always means "cut a release."
- [x] **`default_workflow_permissions: read` does not block a workflow's own declared `permissions:`.** Confirmed live on PR #1 (`pull-requests: write`/`issues: write` worked despite the repo default).
- [x] **Real run #1 failed, for a real reason, now fixed.** `npm pkg set ...` then `git push origin HEAD:main --follow-tags` hit `GH013`: `main` carries a repository rule requiring every change go through a PR (`gh api repos/{owner}/{repo}/rules/branches/main` — `pull_request` rule type, `required_approving_review_count: 0`). Confirmed no orphaned tag or release leaked from the failed run (`git ls-remote --tags`, `gh release list` both clean) — the push failed atomically. **Fix:** the `version` job now commits the bump to a new `release/vX.Y.Z` branch and opens a PR to `main` instead of pushing directly. A new `tag` job, triggered by `pull_request: closed` where `merged == true` and the head branch starts with `release/v`, tags the resulting merge commit and pushes the tag (tags aren't rule-protected — only `main`/`master`/`dev`/`prod` are, confirmed via the same `rules/branches` check). See ADR 0011's amendment.
- [ ] **Run it once for real, end to end this time: dispatch → merge the release PR → confirm `tag` fires → confirm `build`/`publish` fire off the resulting tag push.** Still needs a human: merging the release PR is a real, visible change to `main`, and the eventual `build`/`publish` publishes a real GitHub Release with real installers.

## Comments

Not implemented, deliberately: signing/notarization (unchanged, out of scope per the grilling session), and any change to the repository's branch-protection rules (a human's call — the automation now works *with* the existing rule rather than needing it relaxed).

The two-step shape (`workflow_dispatch` opens a PR, merging it cuts the release) is one more manual click than originally designed, but it's the correct shape given `main` actually enforces PR-only changes — not a workaround to remove later.
