# 06: Up next

**What to build:** The hand-off. When a turn ends and the Queue isn't empty, whoever is next is offered — and only offered.

- **On the Review screen**, after a Take: "**Up next: Sara — Creep**", with **Sing** and **Not now**. This is where a singer actually lands and the moment the mic changes hands.
- **On the Track page**, when they left the Sing screen without recording and something is queued: the same prompt, same two actions.

**Sing** goes to that entry's Sing screen (ticket 05's URL). **Not now** dismisses the prompt and leaves the entry exactly where it is. Nothing ever starts on its own — no countdown, no autoplay, no "starting in 5".

The prompt names the singer when the entry has one and just the Track when it doesn't. An empty Queue shows nothing at all, rather than an empty prompt.

Add **Up next** to `CONTEXT.md`: the prompt offering the Queue's first entry when a turn ends, defined so it is never confused with the entry itself.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] After a Take, the Review screen offers the Queue's first entry with Sing and Not now
- [ ] Leaving the Sing screen without recording shows the same prompt on the Track page
- [ ] Sing opens that entry's Sing screen; Not now leaves the Queue untouched
- [ ] Nothing starts playing or recording on its own, under any timing
- [ ] With an empty Queue, no prompt appears anywhere
- [ ] The prompt handles an entry with no singer name
- [ ] An entry removed by another device between the poll and the tap fails gracefully, offering the new first entry
- [ ] `CONTEXT.md` defines **Up next**
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
