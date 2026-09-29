# 09: ROADMAP and docs

**What to build:** Bring the written record in line with what was decided and built.

- `ROADMAP.md` item 1:
  - Replace **Open: how to read the playlist** with the outcome: route (a), with the spike findings from the spec.
  - Change "No cap on playlist size" to the 100-song limit and why.
  - Add albums, the one-Track-per-Song rule, and the playlist Lane.
  - When everything has landed, move the item to **Done** with a pointer to `.scratch/spotify-import/`.
- **Later** gains: playlists over 100 songs, through a self-hoster's own Spotify Client ID (route (c)) or a login (route (b)), for one's own playlists only.
- Update `README.md`'s one-line roadmap list, if it mentions Spotify import.
- `docs/troubleshooting.md` gets an entry for `playlistUnreadable` ("Spotify changed its page; update Akapela") and for `noYoutubeMatch` (paste a link).

**Blocked by:** 06

**Status:** done

- [x] ROADMAP item 1 matches what was decided and built, with no "Open" left
- [x] Later lists routes (b)/(c) for playlists over 100
- [x] Troubleshooting covers the two new failures

## Comments

**Implemented (2026-09-29).** The ROADMAP's later items were renumbered, and ADR 0014's pointer to them updated to match.
