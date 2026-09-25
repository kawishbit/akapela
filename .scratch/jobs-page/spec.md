# Spec: Jobs page — one place to see what the app is doing

Status: ready-for-agent

`ROADMAP.md`, item 1. Capitalised terms (Job, Lane, Track, Separation, Mix, Take) are defined in `CONTEXT.md`.

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Two Lanes in the runner](issues/01-two-lanes-in-the-runner.md) | done | — |
| 02 | [Cancelling a queued Job](issues/02-cancelling-a-queued-job.md) | done | 01 |
| 03 | [Cancelling a running Job](issues/03-cancelling-a-running-job.md) | done | 02 |
| 04 | [Real Separation progress](issues/04-real-separation-progress.md) | done | — |
| 05 | [The Jobs page](issues/05-the-jobs-page.md) | done | 02 |
| 06 | [Jobs link, badge, and the Library card's chip](issues/06-jobs-link-and-badge.md) | done | 05 |

01 and 04 are independent of each other. 02 → 03 must be sequential. 05 needs the actions it calls (02); 03 and 04 make rows on it do more, and can land either side of it.

## Problem Statement

Background work is invisible unless you are looking at the Track it belongs to. A Track's own page shows its import or its Separation; nothing shows the whole. A Spotify playlist import (item 5) creates dozens of Jobs at once, and there is no view that answers "what is running, what is next, how long until my song is ready". A failed Job can only be found by remembering which Track it was.

Jobs also still run one at a time in one line (ADR 0002). A singer who finishes a Take and asks for its Mix waits behind every queued Separation. ADR 0012 decided two Lanes to fix that; nothing has been built.

## Solution

Two Lanes in the runner, a `cancelled` Job state with cancel/retry/clear actions behind it, real progress for a Separation, and a **Jobs** page that lists every Job with its Track, what it is doing, its state, its progress, and its actions.

## Decisions

- **Lanes.** One `JobsRunner` per Lane, each with its own poll loop and a lane filter in `claimNext`: heavy is `type = 'separate'`, light is everything else. The plugin starts two, after one shared `recoverStaleJobs()`. The Lane is derived from the Job type and never stored on the row.
- **`cancelled` is a fourth terminal Job state**, alongside `succeeded` and `failed`. Cancelling never deletes the Job row: "clear finished" sweeps it up with the rest, and a row disappearing under a running handler is a race nobody needs.
- **Cancelling leaves the target as it was before the Job was asked for.**
  - Separation: back to `none` if the Track had no Stems, back to `ready` with its existing Stems if it was being re-separated. There is no `cancelled` Separation state — the Track should look like the singer never asked.
  - Import: the Track is deleted. A half-imported Track nobody wanted is clutter, and re-pasting the link is trivial.
  - Mix: the Mix row is deleted. Asking again is one tap on the Take.
- **A running Job stops through an `AbortSignal`** on `JobContext`. The runner keeps a `jobId → AbortController` map of what it is running; cancel marks the row and aborts. Handlers kill their child process and remove partial output. A Separation's scratch Stems must never replace the ones already on the Track.
- **Retry adds a new Job row**, through the domain functions that already exist (`retryImport`, `startSeparation`, the Mix render request). The failed row keeps its error. The page shows only the latest Job per target and type, so a retried failure drops out of the list instead of sitting next to its replacement.
- **"Clear finished" removes succeeded Jobs, cancelled Jobs, and failed Jobs that have already been retried.** A failed Job that is still the latest word on its Track or Mix stays, because its row carries the error message the Track page shows. It goes when it is retried or when its target is deleted.
- **No automatic pruning.** Finished Jobs go only when the singer clears them.
- **Real Separation progress.** `separate-cli.ts` writes a `progress <done>/<total>` line to stdout per chunk; the handler maps it into a band between the existing milestones. stderr stays for errors.
- **The page polls** `GET /api/jobs` about once a second while anything is queued or running, and stops when everything is idle — the pattern `useLibrary` already uses while importing. No SSE.
- **Actions are named routes**, not a state-setting PATCH: `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry`, `POST /api/jobs/clear`, with `GET /api/jobs` for the list. Each does different domain work and should say so.
- **Layout.** Three sections: **Running** (at most two, one per Lane), **Queued** (in the order they will run, with a small heavy/light label), **Finished** (newest first). The word "Lane" never appears in the UI.
- **Vocabulary.** The page is called **Jobs**, at `/jobs`, matching `CONTEXT.md`. No second singer-facing name.
- **Rows are keyed by Job id and actions live on the row**, so a future "cancel all queued Separations" for playlist import (item 5) drops in rather than forcing a selection model.
- **`GET /api/jobs/busy` is unchanged.** "Anything queued or running, in either Lane" is still the right answer for the Desktop App's Update check.
- **ADR.** None new. ADR 0012 already carries the Lanes trade-off; it gets a line saying it is built.

## Out of scope

- Manual reordering of the Queue of Jobs.
- Bulk actions (see the row-keying note above).
- The Queue (`ROADMAP.md` item 2), playlist import (item 5), and GPU work (item 4).
- Localisation: English strings, until item 6 lands.
