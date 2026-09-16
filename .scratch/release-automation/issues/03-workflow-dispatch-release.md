# 03: workflow_dispatch cuts a release

**What to build:** A `version` job in `desktop-release.yml`, gated to `workflow_dispatch` only, that computes (or accepts an override for) the next semver, bumps both `package.json` files, commits, and pushes a `vX.Y.Z` tag — which then re-triggers the same workflow's existing `build`/`publish` jobs via the `push: tags` trigger, unchanged.

**Blocked by:** 01 (needs the corrected baseline to bump forward from), 02 (needs the label scheme populated to auto-detect from)

**Status:** ready-for-human

- [x] `workflow_dispatch.inputs.version` accepts blank (auto), `major`/`minor`/`patch` (forced bump), or an explicit `X.Y.Z` (full override).
- [x] Auto mode reads `gh pr list --state merged --search "merged:>$SINCE"` since the previous tag's commit date, takes the highest-precedence `bump:*` label found, defaults to `patch` (covers both an unlabeled PR and a commit landed directly on `main`).
- [x] `npm pkg set version=...` in both the root and `desktop/` (no full install needed, so no extra setup-node step), committed as `github-actions[bot]`, tagged, pushed with `--follow-tags`.
- [x] `build` gated to `if: github.event_name == 'push'` — it and `publish` are skipped on the `workflow_dispatch` run itself (GitHub Actions skips a job automatically when a job it `needs` was skipped), and only run on the tag-push event the `version` job's push produces. This is a **behavior change**: previously `workflow_dispatch` also ran `build` (without publishing) as an ad-hoc "test the build" trigger. That capability is gone; `workflow_dispatch` now always means "cut a release."
- [x] **`default_workflow_permissions: read` does not block a workflow's own declared `permissions:`.** No longer an open question — ticket 02 confirmed this live on PR #1 (`pull-requests: write`/`issues: write` worked despite the repo default). `contents: write` for this job's `git push` is the same mechanism, so it should hold too, but this specific job still hasn't been run.
- [ ] **Run it once for real.** This cannot be done from here: triggering `workflow_dispatch` pushes a real commit and tag to `main` and, once `build`/`publish` complete, publishes a real GitHub Release with real installers. That's exactly the kind of visible, hard-to-fully-reverse action that needs a human's hand on the trigger, not an agent's. Suggested first run: leave `version` blank (auto — this PR is labeled `bump:patch`, so once it's merged that's what the next run will compute, producing `v1.0.1`) and confirm the whole chain end to end.

## Comments

Not implemented, deliberately: signing/notarization (unchanged, out of scope per the grilling session), and any change to the repository's Actions permission settings (a human's call, not this ticket's to make unilaterally).
