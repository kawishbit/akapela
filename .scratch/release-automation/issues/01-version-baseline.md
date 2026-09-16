# 01: Correct the version baseline

**What to build:** Both `package.json` files reading `1.0.0`, matching the `v1.0.0` GitHub Release that already exists and that `desktop/src/update-check.ts` already compares against.

**Status:** done

- [x] Root `package.json` version corrected from `0.1.0` to `1.0.0`.
- [x] `desktop/package.json` version corrected from `0.1.0` to `1.0.0`.

## Comments

`v1.0.0` (tag + published GitHub Release, 2026-09-09) was confirmed live via `git ls-remote --tags origin` and `gh release list` before making this change — it's real, referenced infrastructure, not a stray local tag, so it was corrected-to rather than superseded or deleted. See ADR 0011.
