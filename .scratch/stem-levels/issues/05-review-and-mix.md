# 05: Stem Levels on Review and in the Mix

**What to build:** On the Review screen (`app/pages/tracks/[id]/takes/[takeId].vue`), the Backing Source picker (`:574` onward) becomes Original / Stems. When Stems is chosen and the Track has Stems, the two Stem Level sliders appear, starting from the Take's recorded levels.

- Moving a slider is heard live through the review engine, as the other Review controls are.
- Saving the review (`useTakeReview`, `TakeReviewUpdate`) saves the levels on the Take, the same way `backingSource` is handled today.
- Requesting a Mix (`TakesPanel.vue:48` and the Review screen's Mix action) sends the levels, so the Mix renders what was heard (ticket 02).
- The backing gain slider is unchanged and still scales the whole blend. Its label or hint should make that clear next to the new sliders.
- A Take recorded against Original can be reviewed and mixed against Stems at any levels, provided the Track now has Stems. That is the ADR 0003 promise, extended to levels.
- The Review hint text (`review.backingSourceHint`) is updated to mention the Guide Vocal: sing with it, and mix without it.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] Review opens with the Take's recorded Backing Source and Stem Levels
- [ ] Changing levels on Review is heard live and is saved with the review
- [ ] A Mix requested from Review or the Takes panel carries the levels, and the rendered file reflects them
- [ ] A Take sung to Original can be mixed against Stems at 0/100
- [ ] English and Indonesian strings
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass
