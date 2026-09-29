# 07: No YouTube match

**What to build:** What happens when ticket 06's search finds nothing within ±10 s.

- The import Job fails with a new code, `noYoutubeMatch` (`artist`, `title`). The Track is `failed`, as with any failed import, and keeps its confirmed Song, so the Song stays reserved.
- Retrying a failed Track that has no link asks for a YouTube link: a field on the Track's card or page, "Paste a YouTube link for <title>". The link is checked with `youtubeVideoId` and stored as the Track's `source_ref`. The import is retried from the download step, then goes through Lyrics and Separation as in ticket 06.
- A Track that has a link but failed later, during the download or normalising, retries as it does today, without asking.
- Deleting the failed Track frees its Song.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] No result within ±10 s fails the Job with `noYoutubeMatch`
- [ ] Retrying asks for a link, rejects a non-YouTube link, and completes the import with a valid one
- [ ] The retried Track keeps its Song and still gets Lyrics and a Separation
- [ ] A Track that failed after matching retries without asking
- [ ] The code and every string are in `en.json` and `id.json`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
