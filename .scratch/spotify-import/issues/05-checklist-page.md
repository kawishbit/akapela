# 05: The checklist page

**What to build:** The page where the singer chooses what to import. Read `DESIGN.md` first.

- The Library's import field recognises a Spotify playlist or album link (`parsePlaylistLink`) and goes to `/import/playlist?url=…` instead of creating a Track. A YouTube link or a file behaves as before.
- The page calls the preview route (ticket 04) and shows the playlist's name, whether it is a playlist or an album, and one row per song: title, artist, and duration.
  - `new` rows are ticked.
  - `inLibrary` rows are greyed, unticked, not tickable, and say "In your Library" with a link to the Track.
  - `duplicate` rows are greyed and say "Already in this list".
- A summary follows what is ticked: "Import 42 songs. Separating them will take about 1 h 50 min." It's the ratio from the preview × the sum of ticked durations, rounded kindly. Also add a tick-all / untick-all control.
- **Start** is disabled with nothing ticked. It posts to ticket 06's route and then goes to the Jobs page.
- A refusal (too long, not found, unreadable, invalid link) is shown in its localised words with a way back to the Library. `playlistTooLong` says how many songs there were, that the limit is 100, and suggests making a shorter copy in Spotify.
- The page reloads cleanly from its URL.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Pasting a Spotify playlist or album link in the import field opens the page. YouTube links and files are unchanged.
- [ ] Rows, states, and ticks behave as above
- [ ] The count and estimate follow the ticks
- [ ] Each refusal shows its own message
- [ ] Every string is in `en.json` and `id.json`, and new terms are in `i18n/glossary.md`
- [ ] Works at phone width
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
