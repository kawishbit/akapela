# 03: Add to queue, with the singer's name

**What to build:** **Add to queue** on every Library card and on the Track page, opening a small dialog with one optional field: "Who's singing?". Enter adds; Escape adds with no name; the dialog remembers nothing between adds, because the next person is a different person.

A Track whose Separation hasn't finished can be queued — that is the point of ticket 07 — so nothing here gates on readiness. A Track still importing cannot be sung at all, so it has no **Add to queue**.

Confirmation is quiet: the header count goes up, and a brief "Added to the Queue" is enough. Nothing navigates away from the Library — people add several songs in a row.

Follow `ConfirmDialog.vue`'s existing shape for focus handling and Escape, rather than inventing a second dialog idiom.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Every Library card and the Track page can add to the Queue
- [ ] The dialog's name field is optional; Enter adds with the name, Escape adds without it
- [ ] The field is empty on every open, and focused on open
- [ ] Adding does not navigate away, and the header count reflects it immediately
- [ ] A Track that is still importing offers no add; one that is separating does
- [ ] Adding the same Track twice makes two entries
- [ ] Keyboard and screen-reader behaviour matches the existing dialog
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
