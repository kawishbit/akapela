# Jobs run in two Lanes: heavy and light

_Decided, not yet built. See `ROADMAP.md`, item 1._

Jobs have run one at a time, in creation order, since ADR 0002. That was fine while a Job was one import or one Mix. Spotify playlist import changes the shape: forty Separations queued at once is a few hours of work, and under a single line a singer who finishes a Take and asks for its Mix waits behind all of it.

Jobs now run in two **Lanes**, side by side. The heavy Lane runs Separations; the light Lane runs everything else (imports, Mixes). Each Lane still runs one Job at a time, in creation order, from the same SQLite table.

## Considered options

- **One line, with light Jobs jumping ahead of Separations.** Rejected: a Mix that jumps the line still waits for the Separation that's already running, which is minutes.
- **N Separations at once.** Rejected: a Separation's model call already uses every core the container is given (`intraOpNumThreads = availableParallelism()`), so two at once split the same CPU and finish the batch no sooner, while each holds its own copy of the model and the song in memory. On the 2 GB default allotment that's a real risk of the container being killed.

## Consequences

- A light Job now runs while a Separation holds the CPU, so it's slower than it would be alone. Imports are mostly waiting on the network and a Mix takes seconds, so this is accepted.
- A future GPU-backed heavy Lane doesn't change the shape: still one Separation at a time, with batching inside it (`ROADMAP.md`, item 3).
- "Jobs run one at a time" in `CONTEXT.md` becomes "one at a time per Lane". ADR 0002's SQLite queue stands; only its one-line rule changes.
