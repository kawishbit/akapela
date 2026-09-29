# 06: Error codes for Jobs

**What to build:** A failed Job carries a code the browser translates, instead of an English sentence.

- **The code list** lives in `shared/` (for example `shared/error-codes.ts`), with each code and its typed parameters, and one exported error class the server throws with a code and params. It includes `unexpected`.
- **Migration:** add `error_code` (nullable text) and `error_params` (nullable JSON text) to `jobs`. `error` stays, and keeps the raw English text as it is written today (`jobs-runner.ts`'s `` `${error.name}: ${error.message}` ``).
- **The runner:** a coded error writes its code and params. Anything else writes `unexpected`, and `error` holds the raw text either way.
- **Each Job type:** go through import (yt-dlp, uploads), Separation (model download, ONNX, GPU fallback), and Mix render. Give a code to each failure a singer could act on: a tool is missing, a video is unavailable or private, a model download failed, disk is full, and so on. Anything else stays `unexpected`. Use the tests and real failures to find the ones that actually happen, rather than inventing a code for every `throw`.
- **The browser:** `JobRow` (and anywhere else a Job's failure is shown, such as a Library card) shows the translated code. `unexpected`, and any row with a null code (Jobs from before the migration), shows "Something went wrong" with the raw text under an expandable **Details**.
- **Extend the key-coverage test:** every code in the list has a key in `en.json`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] An existing database with failed Jobs upgrades cleanly, and those Jobs show as `unexpected` with their old text as Details
- [ ] A Job that fails on a recognised cause stores its code and params, and the UI shows the translated sentence with the params filled in
- [ ] A Job that fails on anything else stores `unexpected` and shows the raw text under Details
- [ ] The raw English still appears in logs and traces, unchanged
- [ ] The key-coverage test fails when a code has no `en.json` entry
- [ ] A backup from before the migration restores and upgrades cleanly
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
