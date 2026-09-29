# 03: The playlist Lane

**What to build:** A third Lane, and the label that ties a Job to its Playlist Import.

- Add a nullable `playlist_import_id` and `playlist_import_name` to `jobs` in a migration. A Job with a `playlist_import_id` is part of that Playlist Import. The playlist itself is kept nowhere else.
- `laneOf` in `server/lib/jobs.ts` decides by the Job, not only its type. An import Job with a `playlist_import_id` runs on the new `playlist` Lane. A Separation is always heavy, whatever its label. Everything else stays light.
- `server/plugins/jobs-runner.ts` starts a runner for `playlist` beside `heavy` and `light`.
- `enqueueJob` accepts the label.
- Amend ADR 0012 under a dated `## Amendment` heading. The reasoning to record: a hundred imports on the light Lane would put a Mix behind all of them, which is exactly the wait ADR 0012 exists to prevent. A download is mostly network, so running it beside a Separation and a Mix costs little. `CONTEXT.md`'s **Lane** entry already names three Lanes. Check it matches.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] A migration adds the two columns, and an existing database upgrades cleanly
- [ ] A labelled import runs on the playlist Lane, while a Mix and an unlabelled import run on the light Lane at the same time
- [ ] A labelled Separation runs on the heavy Lane
- [ ] Each Lane still runs one Job at a time, in creation order
- [ ] Cancel and retry work unchanged for labelled Jobs, and a retried Job keeps its label and Lane
- [ ] ADR 0012 amended
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
