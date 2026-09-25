# 07: Entries whose Separation isn't finished

**What to build:** A Track can be queued the moment it is imported, long before its Stems exist. The Queue has to be honest about that without blocking the party.

An entry whose Track is separating shows the Separation's progress on the row (the same number the Jobs page and the Library card show). Its **Sing** opens a small choice:

- **Sing over the original** — go to the Sing screen with the Track's original audio as the Backing Track, as the app already allows.
- **Leave it for now** — move the entry down one place rather than removing it. The request isn't lost; the next person goes.

An entry whose Separation failed offers the same choice, worded for a failure rather than a wait ("Separation failed" with **Sing over the original** and a link to retry it on the Track page). An entry whose Track is ready is untouched by any of this and goes straight to Sing.

Once the Separation finishes, the row loses its progress and its choice on the next poll, with no reload.

**Blocked by:** 02

**Status:** done

- [x] A separating entry shows its progress, and the number agrees with the Library card's
- [x] Its Sing offers Sing over the original and Leave it for now
- [x] Sing over the original opens the Sing screen using the original audio, and the Take records what was actually sung over
- [x] Leave it for now moves the entry down exactly one place and never removes it
- [x] Leave it for now on the last entry is a no-op rather than an error
- [x] A failed Separation offers the same choice, worded for the failure, with a way to retry
- [x] A ready Track's Sing goes straight through with no extra dialog
- [x] A Separation finishing while the page is open clears the progress and the choice on the next poll
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
