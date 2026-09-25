# Spec: Queue — the list of who sings next

Status: done

`ROADMAP.md`, item 2. Capitalised terms (Queue, Queue Entry, Track, Take, Separation, Backing Track) are defined in `CONTEXT.md`.

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [The Queue table and its API](issues/01-queue-table-and-api.md) | done | — |
| 02 | [The Queue page](issues/02-the-queue-page.md) | done | 01 |
| 03 | [Add to queue, with the singer's name](issues/03-add-to-queue.md) | done | 01 |
| 04 | [Reorder, Play next, rename](issues/04-reorder-and-play-next.md) | done | 02 |
| 05 | [Singing an entry](issues/05-singing-an-entry.md) | done | 02 |
| 06 | [Up next](issues/06-up-next.md) | done | 05 |
| 07 | [Entries whose Separation isn't finished](issues/07-not-ready-entries.md) | done | 02 |
| 08 | [Adding from the Queue page](issues/08-add-from-the-queue-page.md) | done | 03 |

01 first, then 02 as the spine. 03–08 land independently on top of it.

## Problem Statement

Karaoke runs on a list of who sings next. Akapela has only a Library: a grid of songs with no notion of turns, of who asked for what, or of what comes after the song playing now. At a party that list lives in someone's head, or on a phone's notes app, and the person holding the laptop becomes a bottleneck.

## Solution

One **Queue** per install, on the server, shared by every device in the house. A page at `/queue` that lists **Queue Entries** — a Track plus an optional singer name — with add, remove, reorder, **Play next**, and clear. Singing an entry consumes it, and offers whoever is next.

## Decisions

- **A `/queue` page**, reached from a header link with a count, beside Jobs. It survives a reload, it can be opened straight on a phone, and it is not a panel hovering over the Sing screen.
- **The home screen does not change.** The Library stays the Library; the Queue page carries its own empty state ("Nobody's up yet. Add a song from your Library."). An "Up next" strip on the home screen is a thing to want after a real party, not before one.
- **Every device sees the full app.** No lighter guest view: with no accounts there is no host-and-guest split to hang one off, and `/queue` with its own Library search *is* the add-a-song view.
- **The name is asked at add time**, in a small dialog with one optional "Who's singing?" field — Enter adds, Escape adds with no name. It remembers nothing between adds. The name is also editable inline on the Queue page, for a typo.
- **Ordering is an integer `position`** per entry, rewritten for the affected rows in one transaction per move. A house Queue is tens of entries; fractional keys drift and need rebalancing for no gain. Two phones reordering at once is last-write-wins, corrected by the next poll.
- **The page polls** `GET /api/queue` about every 3 seconds while it is open. A couple of seconds' lag on "who's next" costs nothing, and it is the pattern the Library and the Jobs page already use. SSE becomes worth it only if the Queue ends up on a screen people watch without touching.
- **Singing an entry** goes to `/tracks/:id/sing?entry=<entryId>`. The entry is removed when that visit to the Sing screen ends — a Take finished (they land on Review), or they navigated away. A second Take in the same visit does not need the entry back, and backing out immediately still counts as their turn passing.
- **Up next appears on the Review screen** after a Take, and on the Track page when they left the Sing screen without recording: "**Up next: Sara — Creep**", with **Sing** and **Not now**. **Not now** leaves the entry where it is. Nothing ever starts on its own.
- **An entry whose Separation isn't finished** shows the Separation's progress. Its **Sing** offers a choice: **Sing over the original** or **Leave it for now**, which moves it down one place rather than removing it. The decision belongs where the room is looking, not after the singer is already on the Sing screen.
- **Entries cascade** when their Track is deleted, like every other child row. The delete confirm gains one line when entries exist ("It's in the Queue twice"), so it isn't a surprise mid-party.
- **The Queue rides along in a backup**, because `restore` replaces the whole database file. Carving one table out of a file-level restore is machinery for a situation that barely happens, and a stale Queue is one tap on **Clear** away.
- **Vocabulary.** Queue and Queue Entry are already in `CONTEXT.md`. **Up next** joins it with ticket 06.
- **No ADR.** One shared server-side Queue with no accounts is a straight consequence of what Akapela already is.

## Out of scope

- Automatic playback: nothing starts a song on its own, ever.
- Accounts, singer identity, or per-device state.
- An "Up next" strip on the home screen.
- Localisation: English strings, until `ROADMAP.md` item 6 lands.
