# 05: Singing an entry

**What to build:** The link between the Queue and the Sing screen, and the entry being consumed by a turn.

An entry's **Sing** goes to `/tracks/:id/sing?entry=<entryId>`. The Sing screen shows the singer's name quietly beside the Track title when the entry has one ("Sara") — the difference between a screen and a party. Nothing else about the Sing screen changes, and a Sing opened without `entry` behaves exactly as it does today.

The entry is removed when that visit to the Sing screen ends:

- a Take finished and they landed on Review (`sing.vue` already navigates there), or
- they navigated away from the Sing screen by any route.

A second Take in the same visit does not bring the entry back. Backing out without recording still counts as their turn passing, which is what the roadmap decided.

Removal goes through the server, so every other device sees it. It must be robust to the obvious ways a page leaves: in-app navigation, a browser back, a reload, and a closed tab. Removing an entry that is already gone is a no-op, never an error the singer sees.

The entry id travels as a query parameter and nothing else depends on it, so a stale or bogus `entry=` value must be ignored rather than break the screen.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] An entry's Sing opens the Sing screen for its Track, with `entry` in the URL
- [ ] The singer's name shows on the Sing screen when the entry has one, and nothing shows when it doesn't
- [ ] Finishing a Take removes the entry, and the Queue on another device reflects it within a poll
- [ ] Leaving the Sing screen without recording removes the entry
- [ ] Recording a second Take in the same visit does not re-add or re-remove anything
- [ ] A reload or a closed tab still removes the entry, or removes it on the next visit — it never strands
- [ ] A stale `entry=` id is ignored silently; Sing without `entry` is unchanged
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
