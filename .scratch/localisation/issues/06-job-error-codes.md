# 06: Error codes for Jobs

**What to build:** A failed Job carries a code the browser translates, instead of an English sentence.

- **The code list** lives in `shared/` (for example `shared/error-codes.ts`), with each code and its typed parameters, and one exported error class the server throws with a code and params. It includes `unexpected`.
- **Migration:** add `error_code` (nullable text) and `error_params` (nullable JSON text) to `jobs`. `error` stays, and keeps the raw English text as it is written today (`jobs-runner.ts`'s `` `${error.name}: ${error.message}` ``).
- **The runner:** a coded error writes its code and params. Anything else writes `unexpected`, and `error` holds the raw text either way.
- **Each Job type:** go through import (yt-dlp, uploads), Separation (model download, ONNX, GPU fallback), and Mix render. Give a code to each failure a singer could act on: a tool is missing, a video is unavailable or private, a model download failed, disk is full, and so on. Anything else stays `unexpected`. Use the tests and real failures to find the ones that actually happen, rather than inventing a code for every `throw`.
- **The browser:** `JobRow` (and anywhere else a Job's failure is shown, such as a Library card) shows the translated code. `unexpected`, and any row with a null code (Jobs from before the migration), shows "Something went wrong" with the raw text under an expandable **Details**.
- **Extend the key-coverage test:** every code in the list has a key in `en.json`.

**Blocked by:** 01

**Status:** done

- [x] An existing database with failed Jobs upgrades cleanly, and those Jobs show as `unexpected` with their old text as Details
- [x] A Job that fails on a recognised cause stores its code and params, and the UI shows the translated sentence with the params filled in
- [x] A Job that fails on anything else stores `unexpected` and shows the raw text under Details
- [x] The raw English still appears in logs and traces, unchanged
- [x] The key-coverage test fails when a code has no `en.json` entry
- [x] A backup from before the migration restores and upgrades cleanly
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

**Done.**

- The code list is `shared/error-codes.ts`, with each code's parameter names, `CodedError`, `failure()` and `toCodedFailure()`.
- The runner writes `error_code` and `error_params` (migration `0022`), and keeps the raw English in `error` exactly as before.
- Codes attached where a singer can act:
  - yt-dlp missing, video unavailable, a link that's a playlist or leads to nothing, yt-dlp failing, and Akapela's own yt-dlp failing to download (`server/lib/sources.ts`, `ytdlp.ts`);
  - the JavaScript runtime missing or failing;
  - ffmpeg missing, an undecodable upload (`audio.ts`);
  - a model download failing (`download-model.ts`);
  - a full disk, wherever it surfaces (`ENOSPC`).
- Everything else is `unexpected`.
- I found the "video unavailable" wording by running a real import of a video that doesn't exist. yt-dlp says "This video is unavailable", which the first version of the pattern missed. It's in `tests/unit/sources-errors.test.ts` now.
- A Job's `detail` line is now a token from `shared/job-detail.ts` (`downloadingModel`, `finishedOnCpu`) that the browser puts into words, since it was English shown in the UI.
- `tests/unit/job-error-codes-migration.test.ts` migrates a library to `0021`, adds a failed Job, then runs `0022`. The Job reads as `unexpected` with its old text as Details. A restored backup takes the same path, since it is migrated on the next start.
