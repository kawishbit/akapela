# Jobs run in two Lanes: heavy and light

_Built: `server/plugins/jobs-runner.ts` starts one `JobsRunner` per Lane. See `ROADMAP.md`, Done (Jobs page)._

Jobs have run one at a time, in creation order, since ADR 0002. That was fine while a Job was one import or one Mix. Spotify playlist import changes the shape: forty Separations queued at once is a few hours of work, and under a single line a singer who finishes a Take and asks for its Mix waits behind all of it.

Jobs now run in two **Lanes**, side by side. The heavy Lane runs Separations; the light Lane runs everything else (imports, Mixes). Each Lane still runs one Job at a time, in creation order, from the same SQLite table.

## Considered options

- **One line, with light Jobs jumping ahead of Separations.** Rejected: a Mix that jumps the line still waits for the Separation that's already running, which is minutes.
- **N Separations at once.** Rejected: a Separation's model call already uses every core the container is given (`intraOpNumThreads = availableParallelism()`), so two at once split the same CPU and finish the batch no sooner, while each holds its own copy of the model and the song in memory. On the 2 GB default allotment that's a real risk of the container being killed.

## Consequences

- A light Job now runs while a Separation holds the CPU, so it's slower than it would be alone. Imports are mostly waiting on the network and a Mix takes seconds, so this is accepted.
- A future GPU-backed heavy Lane doesn't change the shape: still one Separation at a time, with batching inside it (`ROADMAP.md`, item 1).
- "Jobs run one at a time" in `CONTEXT.md` becomes "one at a time per Lane". ADR 0002's SQLite queue stands; only its one-line rule changes.

## Amendment (2026-09-29): a third Lane for Playlist Imports

_Built: `laneOf` and `laneCondition` in `server/lib/jobs.ts`; `server/plugins/jobs-runner.ts` starts a runner for each of the three. See `.scratch/spotify-import/`._

A Playlist Import creates up to a hundred import Jobs at once, one per song, each searching YouTube and downloading. On the light Lane, a Mix asked for a minute later would wait behind all of them. That is the wait this ADR exists to prevent, moved from the heavy Lane to the light one.

So there is a third Lane, the **playlist Lane**. It runs the import Jobs that a Playlist Import started, which are the ones labelled with a Playlist Import id. The light Lane keeps everything else, including an import started by hand. The heavy Lane still runs every Separation, whatever its label, so a playlist's Separations queue behind other Separations as before. Each Lane still runs one Job at a time, in creation order.

- **Why this costs little.** A download is mostly waiting on the network, and normalising takes seconds, so running one beside a Separation and a Mix takes little from either.
- **Considered: labelled imports jumping to the back of the light Lane.** Rejected. A Mix that arrives while the hundredth import runs still waits for that import, and "in creation order" would stop being true.
- **The Lane is still derived, never stored.** It comes from the Job's type and whether it has a Playlist Import label. A retried import keeps its label, and so keeps its Lane.
