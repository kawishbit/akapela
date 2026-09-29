# Spec: More languages, starting with Indonesian

Status: ready-for-agent

`ROADMAP.md`, item 2. ADR 0014 and its amendment. Capitalised terms (Language, Track, Take, Mix, Job, Preset, ...) are defined in `CONTEXT.md`.

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [i18n plumbing and the Language picker](issues/01-plumbing-and-picker.md) | done | — |
| 02 | [Strings: the Library and the app's shell](issues/02-strings-library-and-shell.md) | done | 01 |
| 03 | [Strings: the Track page](issues/03-strings-track-page.md) | done | 01 |
| 04 | [Strings: singing and review](issues/04-strings-sing-and-review.md) | done | 01 |
| 05 | [Strings: Queue, Jobs, and Settings](issues/05-strings-queue-jobs-settings.md) | done | 01 |
| 06 | [Error codes for Jobs](issues/06-job-error-codes.md) | done | 01 |
| 07 | [Error codes for API routes](issues/07-api-error-codes.md) | done | 06 |
| 08 | [Draft `id.json`, the glossary, and the completeness report](issues/08-indonesian-draft.md) | done | 02, 03, 04, 05, 07 |
| 09 | [Review Indonesian](issues/09-review-indonesian.md) | ready-for-human | 08 |

Start with 01. 02–06 can land in any order on top of it, and 07 builds on the code list from 06. 08 waits until every string and code is in `en.json`. Everything is on one branch, `feature/localisation`, which merges only after 09.

## Problem Statement

Every word Akapela shows is in English, hardcoded in the components. That includes the reason a Job failed, which is whatever English sentence (or tool stderr) the server caught. A singer who doesn't read English can't use the app, and the errors, the text they most need to understand, are the least readable part.

## Solution

Every user-facing string in the Nuxt app moves into `@nuxtjs/i18n` locale files, one JSON file per Language, loaded lazily (ADR 0014). The server sends failures as stable codes with parameters, and the browser turns them into words. Indonesian ships as the second Language, complete and reviewed.

## Decisions

**The Language**

- **Per device, in a cookie**, not a server Setting (ADR 0014 amendment). The server renders the right Language on the first paint. The picker is on the Settings page, marked as applying to this device only.
- **The picker** lists *Automatic (browser language)*, then each Language in its own name: *English*, *Bahasa Indonesia*. Automatic is the default, and picking it clears the cookie.
- **Automatic** maps `id` and `id-*` to Indonesian, and everything else to English. That includes Malay (`ms`): close to Indonesian, but not the same Language.
- **No URL prefixes** (`strategy: 'no_prefix'`).
- **Dates, times, and numbers** follow the chosen Language, not the browser's locale. The `toLocale*(undefined, …)` calls in `app/utils/format.ts` and `app/utils/jobs.ts` take the Language's locale instead.
- **`<html lang>`** is the chosen Language, not the hardcoded `en` in `nuxt.config.ts`.

**The strings**

- **English is the source of truth.** `en.json` must have every key. Other Languages fall back to English one key at a time. A test fails if a key used in code, or an error code in the shared code list, is missing from `en.json`. A script reports each other Language's completeness. It is a report, not a gate.
- **Domain terms are translated**, with one fixed rendering per `CONTEXT.md` term, recorded in a glossary that translators work from. Service and format names stay as they are: YouTube, LRCLIB, Genius, Spotify, WAV, FLAC, MP3.
- **Never translated:** Lyrics, Track titles and artists, singer names in the Queue, and user Preset names.
- **Built-in Preset names stay English** for now: Slowed and Reverb, Nightcore, and Practice are genre names people search for as written. If the Indonesian reviewer disagrees (ticket 09), built-ins get a translation keyed on their stable id (`preset-nightcore`, ...). The duplicate-name check then has to reject the translated names as well.
- **Text written only for logs stays English:** server logs, traces, and the browser `console.error`/`console.warn` lines relayed to the Dashboard.

**Errors**

- **One code list in `shared/`**, imported by both server and browser. Each code declares its parameters (a tool name, a model name, ...) with types. The server throws a typed error built from it.
- **Jobs** gain `error_code` and `error_params` (JSON) columns. `error` keeps the raw English text as the detail.
- **API routes** keep their English `statusMessage` and add `data: { code, params }`. Where a finer distinction wouldn't change what the singer does, several routes share one code.
- **`unexpected`** covers any failure without a code: an uncaught exception in a Job, a 500 from a bug, a failed Job from before this change. It shows as a translated "Something went wrong", with the raw text under an expandable **Details**. The headline is always in the singer's Language, and the detail is never hidden.
- **Old failed Jobs are not migrated.** A null code reads as `unexpected`, with `error` as the Details.
- **Failures raised in the browser** (microphone permission, the audio engine) aren't server codes. They are ordinary translated strings.

**Delivery**

- **Indonesian ships complete.** One branch, merged once `id.json` is complete and reviewed. A half-translated picker makes a worse first impression than waiting.
- **Claude drafts `id.json`**, from `en.json` and the glossary. The maintainer reviews it (ticket 09).

## Out of scope

- The Desktop shell's own strings: native menus, dialogs, the update prompt dialog, startup error boxes, and the first-launch chooser in `desktop/src/splash.ts`. Everything inside the window is covered. The shell comes later (`ROADMAP.md`, Later), since on first launch it has no Language setting to follow.
- The Website, the PWA manifest's name and description, and the docs.
- Right-to-left layout. Indonesian doesn't need it. The first RTL Language will.
- Languages beyond English and Indonesian.
