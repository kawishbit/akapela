# 01: Sign and notarize the macOS build

**What to build:** A singer downloads the macOS DMG and opens it normally.
Today macOS calls the app "damaged" — how it treats any unsigned app from the
internet — and the README talks them through clearing the quarantine flag by
hand. Signing and notarizing removes that step, and the README paragraph with
it.

Most of the plumbing is already there: the release workflow passes `CSC_LINK`
and `CSC_KEY_PASSWORD` from repository secrets on the darwin leg, and
`electron-builder.yml` already keeps the hardened runtime and the microphone
entitlement for exactly this moment. What is missing is `notarize: true` and
the Apple ID credentials behind it.

This also forces a decision that is bigger than signing. ADR 0009's amendment
on Updates says macOS links to the download page instead of updating in place,
because Squirrel.Mac refuses to update an unsigned app. Once the app is
signed, that reason is gone: macOS could auto-update like Windows and Linux,
which means `dmg.writeUpdateInfo`, the update metadata the release workflow
checks for, and the prompt's platform split all need revisiting. Amend the ADR
as part of this, or decide deliberately not to.

Do not enable notarization before the credentials exist. `notarize: true`
without them does not skip quietly — it fails the build, and it would fail it
on a tagged release.

**Blocked by:** An Apple Developer Program membership ($99/year), a Developer
ID Application certificate, and an app-specific password. None of this can
start or be verified without them.

**Status:** ready-for-human

- [ ] A Developer ID Application certificate is exported and stored as the
      repository secret the workflow already reads
- [ ] `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are stored
      as repository secrets and reach the darwin leg
- [ ] `notarize: true`, and a tagged release produces a DMG that passes
      `spctl --assess` and opens on a clean Mac with no quarantine warning
- [ ] The README's `xattr -dr com.apple.quarantine` paragraph is removed
- [ ] ADR 0009's amendment on Updates is revisited: either macOS gains
      in-place updates, or the ADR records why it still does not

## Comments
