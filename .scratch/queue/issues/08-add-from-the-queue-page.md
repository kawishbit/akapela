# 08: Adding from the Queue page

**What to build:** **Add a song** on the Queue page, so the one screen a guest is handed is enough on its own.

It opens an inline search over the Library — the same matching the Library's own search box uses, not a second notion of what matching means — and picking a result opens ticket 03's name dialog and appends the entry. The search stays on `/queue`; nobody is navigated to the Library and left to find their way back.

A guest looking for a song that isn't in the Library at all is out of scope here: importing is the Library's job, and the empty result says so plainly ("Nothing in the Library matches. Import it from the Library first.").

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] **Add a song** on the Queue page opens an inline Library search
- [ ] Results match the Library's own search behaviour
- [ ] Picking a result opens the name dialog and appends the entry, without leaving `/queue`
- [ ] Tracks still importing are not offered
- [ ] An empty result explains where importing happens
- [ ] Works at phone width, with the on-screen keyboard up, and keyboard reachable
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
