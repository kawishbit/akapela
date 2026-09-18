# Localisation through one JSON file per language, and error codes from the server

_Decided, not yet built. See `ROADMAP.md`, item 5._

Every user-facing string moves into `@nuxtjs/i18n` locale files, one JSON file per language, loaded only when that language is in use, so adding a language means adding a file and nothing else. The browser's language is the default and Settings can override it.

Errors the singer sees are the part that isn't obvious. Today a failed Job's reason is an English sentence written by the server. Under this decision the server sends a stable error code (with any values it needs, such as a tool name), and the browser turns the code into text in the singer's language. Logs, and traces in the Dashboard, stay in English.

## Considered options

- **Translate on the server** (the server knows the requested language and writes the sentence in it). Rejected: two places to keep translations, and a Job that failed while one person was using the app would show its error in that person's language to everyone afterwards.
- **Translate the UI and leave server errors in English.** Rejected: the errors are exactly the text a singer most needs to understand.

## Consequences

- Every error a Job or an API route can hand back to the UI needs a code. That's a contract between server and browser that has to be kept stable across Releases, since a code with no translation shows up raw.
- Worth doing early: every screen added before this lands adds strings to move.
