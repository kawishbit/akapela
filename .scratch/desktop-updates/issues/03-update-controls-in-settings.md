# 03: Update controls in Settings

**What to build:** Settings' desktop section lets the singer control the update check.

- An "Check for updates automatically" switch, on by default and saved in the Desktop App's config store. When it is off, the launch check doesn't run, so the Desktop App makes no network call to GitHub at all.
- A **Check now** button. It runs the check on demand, with the switch on or off, and shows that it's checking. If an Update exists it opens the same prompt as at launch, **even if that version was skipped**, because asking is explicit. If there's no Update it says the app is up to date. If the check fails it says so.

**Blocked by:** 02 (Skip this version)

**Status:** ready-for-agent

- [ ] Turning the switch off stops the next launch from checking (no request to GitHub), and turning it on resumes checking
- [ ] **Check now** opens the prompt for a newer Release even if it was skipped, and even with the switch off
- [ ] **Check now** says clearly when the app is up to date and when the check failed, and never fails silently
- [ ] The switch's stored default and fallback are covered by the root vitest suite
- [ ] Neither control appears when the app is served to a browser

## Comments
