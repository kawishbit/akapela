# 01: Prompt the singer about an Update at launch

**What to build:** When the Desktop App launches and a newer Release exists, the singer sees a prompt inside the app. It shows the Update's version next to the one they're running, links to "What's new" on the Release page, and offers **Update now** and **Later**. In this ticket **Update now** opens the Release page on every platform. Ticket 05 makes it install in place on Windows and Linux. **Later** closes the prompt, and the next launch asks again.

The prompt never interrupts singing. While the singer is on Sing or Take Review it waits, and appears on their next navigation to any other page. It is part of the Nuxt app, not a native dialog (see ADR 0009's amendment on Updates). The browser and compose never see it, the same way Settings already hides the desktop-only section.

The existing launch check stays the one thing that decides whether an Update exists. It already stays quiet when offline, skips drafts and prereleases, and has tests. The quiet notice in Settings stays as it is.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] An older packaged build, launched while a newer Release exists, shows the prompt with both versions and a working "What's new" link (needs a packaged build)
- [x] **Update now** opens the Release page in the browser, and **Later** closes the prompt until the next launch
- [x] Launching straight into Sing or Take Review, or reaching them before the check finishes, holds the prompt back until the singer navigates elsewhere
- [x] No prompt when there is no newer Release, when the check fails or is offline, or when the app is served to a browser (compose, `pnpm dev`)
- [x] The rule for when the prompt may show (the route, and whether an Update is waiting) is a plain function covered by the root vitest suite

## Comments

Built. The prompt is `app/components/UpdatePrompt.vue` over `useUpdates()`; the rule is `promptShows` in `app/utils/update-prompt.ts`, and the pages that hold it back carry `updatePrompt: false`.

The first criterion (an older packaged build seeing it) needs a packaged build against a newer Release, so it is unticked until someone runs one.
