# Localisation through one JSON file per language, and error codes from the server

_Built on `feature/localisation`; Indonesian awaits review. See `ROADMAP.md`, item 1, and `.scratch/localisation/`._

Every user-facing string moves into `@nuxtjs/i18n` locale files, one JSON file per language, loaded only when that language is in use, so adding a language means adding a file and nothing else. The browser's language is the default and Settings can override it.

Errors the singer sees are the part that isn't obvious. Today a failed Job's reason is an English sentence written by the server. Under this decision the server sends a stable error code (with any values it needs, such as a tool name), and the browser turns the code into text in the singer's language. Logs, and traces in the Dashboard, stay in English.

## Considered options

- **Translate on the server** (the server knows the requested language and writes the sentence in it). Rejected: two places to keep translations, and a Job that failed while one person was using the app would show its error in that person's language to everyone afterwards.
- **Translate the UI and leave server errors in English.** Rejected: the errors are exactly the text a singer most needs to understand.

## Consequences

- Every error a Job or an API route can hand back to the UI needs a code. That's a contract between server and browser that has to be kept stable across Releases, since a code with no translation shows up raw.
- Worth doing early: every screen added before this lands adds strings to move.

## Amendment: the Language is per device, and unexpected failures still get a code

Settled before building, in `.scratch/localisation/spec.md`.

- **The Language belongs to the device, not the install.** Settings in Akapela are otherwise shared by every device, like the Queue. A Language stored there would switch every phone in the house when one person picked it, which contradicts following the browser's language. The override is kept in a cookie, so server-side rendering already produces the right Language on the first paint. It is shown on the Settings page, marked as applying to this device only.
- **URLs carry no Language prefix** (`no_prefix`). Prefixes exist so search engines can index each language, and Akapela is a self-hosted app that no search engine sees. `/queue` is `/queue` everywhere, and a link opened on another device shows that device's own Language.
- **A failure the server did not anticipate still gets a code**: `unexpected`, shown translated as a generic message with the raw English text underneath as Details. Most Job failures are exceptions from ffmpeg, yt-dlp, or ONNX Runtime whose text can't be translated but is exactly what a bug report needs. The headline is always in the singer's Language, and the detail is never hidden. Failed Jobs from before this change have no code and are shown the same way.
- **A Job stores its code in columns of its own**: `error_code` and `error_params`. The existing `error` column keeps the raw English text. API routes keep their English `statusMessage` for logs and the Dashboard, and carry `{ code, params }` in the error's `data`.
- **Other Languages may be incomplete.** A missing key falls back to English, one key at a time. Only `en.json` is required to be complete, and a test checks it against every key used in code and every code the server can emit. Requiring every Language to be complete would make every new screen wait on every translator.
