# 01: Name the Windows installer so its update link works

**What to build:** "Download update" in an installed Windows Desktop App fetches the installer from the latest Release, instead of failing on a 404.

It fails today because the same installer ends up with three different names. electron-builder writes the file as `Akapela Setup <version>.exe`, with spaces. GitHub turns those spaces into dots on upload, so the Release asset is `Akapela.Setup.<version>.exe`. The `latest.yml` electron-updater reads names it `Akapela-Setup-<version>.exe`, with dashes. The updater asks for a file the Release doesn't have. Confirmed on v1.2.2: its assets are `Akapela.Setup.1.2.2.exe` (+ `.blockmap`, `.sha256`) while `latest.yml` names `Akapela-Setup-1.2.2.exe`. The singer saw the space-encoded form, `Akapela%20Setup%201.2.2.exe`. Every Release so far has this problem, not only 1.2.2.

Fix it at the source: give the NSIS installer a file name with no spaces, so the name on disk, the uploaded asset and `latest.yml` all match. The DMG and AppImage names already have no spaces. Then make the release workflow's existing update-metadata check catch this: every file `latest.yml` / `latest-linux.yml` names must be among the files the workflow uploads. That way the next mismatch fails the build rather than the singer's update.

Installs on 1.2.2 or earlier only read `latest.yml` from the newest Release, so they should update once the next Release is built with this fix. Check that against the updater's GitHub provider rather than assuming it. If it turns out to be wrong, say so in the ticket and in the release notes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] The Windows installer's file name contains no spaces, and the name in `latest.yml` is exactly the name of the uploaded asset
- [x] The release workflow fails with a clear error when a file named in `latest.yml` or `latest-linux.yml` is not among the Release's assets
- [ ] A dry run's workflow artifacts show the installer, its blockmap, its `.sha256` and `latest.yml` all using the same name
- [x] Whether an existing 1.2.2 install can update to the fixed Release is checked and recorded in this ticket's comments
- [x] Any docs or README that name the Windows installer file are updated to the new name

## Comments

**Implemented.** The NSIS `artifactName` is now `${productName}-Setup-${version}.${ext}`, so the file on disk, the Release asset, and `latest.yml` are all `Akapela-Setup-<version>.exe`. The release workflow's "Check the update metadata" step now reads every `url:`/`path:` in `latest.yml` and `latest-linux.yml` and fails if that file isn't in `desktop/release`. Run against the real v1.2.2 metadata, the old build would have failed it: it names `Akapela-Setup-1.2.2.exe`, while the file on disk was `Akapela Setup 1.2.2.exe`.

**Can a 1.2.2 install update?** Yes. electron-updater's GitHub provider (`GitHubProvider.resolveFiles`) finds the latest tag, reads *that* Release's `latest.yml`, and downloads `/releases/download/<tag>/<url with spaces as dashes>`. The next Release's `latest.yml` names `Akapela-Setup-<next>.exe`, and that asset will exist, so the client already installed doesn't matter. v1.2.2 itself stays broken for in-app installs, but nobody is updating *to* it once a newer Release exists.

**Still needs a human:** a dry run of the release workflow, to see the artifacts named consistently (the dry-run criterion above is left unchecked). No docs name the installer file, so nothing needed updating there.
