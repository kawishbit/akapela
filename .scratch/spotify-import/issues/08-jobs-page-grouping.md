# 08: Following it on the Jobs page

**What to build:** A Playlist Import shown as one thing on `/jobs`.

- `GET /api/jobs` includes each Job's Playlist Import label.
- The Jobs page groups labelled Jobs under one row per Playlist Import. The row shows its name, "12 of 42 imported · 3 of 42 separated", and how many failed. It expands into its Jobs, shown as they are today.
- **Cancel all** cancels every queued or running Job with that label. Each one is cancelled the ordinary way: an import's Track is deleted, and a Separation's Track goes back to having no Stems. Tracks that already finished importing stay.
- **Clear** of finished Jobs removes the group once none of its Jobs is left.
- The header badge counts as it does now: every queued or running Job.

**Blocked by:** 06

**Status:** done

- [x] Labelled Jobs show as one group row with progress counts, and expand to their Jobs
- [x] Cancel all cancels only that group's unfinished Jobs, each with the usual cancel behaviour
- [x] Clearing finished Jobs removes an emptied group
- [x] Every string is in `en.json` and `id.json`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Implemented (2026-09-29).** Cancelling an import whose Track is already ready (its Job still fetching Lyrics) keeps the Track. Known gap: the "of N" count is taken from the listed Jobs, so pressing Clear finished part-way through lowers it.
