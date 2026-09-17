# 02: Skip this version

**What to build:** The Update prompt gets a third choice, **Skip this version**. The skip is remembered across launches, in the Desktop App's config store next to the port and window bounds. The launch check won't offer that Release again. A Release newer than the skipped one brings the prompt back, and that newer Release can be skipped in turn.

**Blocked by:** 01 (Prompt the singer about an Update at launch)

**Status:** done

- [x] After **Skip this version**, relaunching with the same latest Release shows no prompt
- [x] When a Release newer than the skipped one appears, the launch prompt comes back
- [x] The skipped version survives a restart, and a missing or corrupt config value behaves as "nothing skipped"
- [x] The rule deciding whether a skip suppresses an Update, and the config store's handling of the new field, are covered by the root vitest suite with no Electron import

## Comments

Built. `offeredUpdate` in `desktop/src/update-check.ts` decides it, the shell stores `skippedUpdate` in its config, and the prompt's third button calls it through the bridge. A skip covers anything not newer than the skipped Release.
