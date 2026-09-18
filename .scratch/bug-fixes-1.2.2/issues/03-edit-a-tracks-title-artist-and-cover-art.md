# 03: Edit a Track's title, artist and cover art

**What to build:** On the Track screen, the singer can change a Track's title and artist, and replace its cover art with an image of their own. Today all three come from the import (a YouTube video's title and thumbnail, or an upload's file name), or the cover comes from the confirmed Song's album art, and none of them can be corrected. After an edit, the new title, artist and cover show everywhere the Track appears: the Library's Track cards, the Player Bar, the Track screen, the Sing screen's header and background, and Take screens.

Scope:

- **Title and artist** are the Track's own display fields. Editing them does **not** change the confirmed Song, which is what Lyrics are looked up by and which is edited in the Song panel. Confirming a Song later doesn't overwrite a title or artist the singer typed. The title must not be empty. The artist can be cleared, and then shows as "Unknown artist" as it does today.
- **Cover art** is replaced by uploading an image file. Use the same limits and write-then-rename the existing album-art replacement uses: the same size cap, image types only, and the old cover removed when the new one has a different extension. A rejected file leaves the current cover in place and tells the singer why. Cover URLs already change with `updatedAt`, so a new cover shows up without a stale cache.
- There is **no album name**. A Track doesn't store one, and this ticket doesn't add one.

Covered by server-side tests for the edit endpoint(s): validation, persistence, and title/artist not touching the Song or Lyrics. Also a test for the cover upload: accepted, rejected for type or size, and the old file removed.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] The Track screen has an edit control that lets the singer change the title and artist and save them
- [x] An empty title is rejected; an empty artist is saved as no artist
- [x] Editing title/artist leaves the confirmed Song, the Lyrics Provider and the Lyrics unchanged
- [x] The singer can upload an image to replace the cover art; non-images and oversized files are rejected with a message and the old cover is kept
- [x] The new title, artist and cover appear in the Library, Player Bar, Track screen, Sing screen and Take screens without a reload serving the old cover
- [x] Confirming a Song afterwards doesn't overwrite a title or artist the singer set. Whether it may still replace a cover the singer uploaded is decided and recorded here. Suggested default: a cover the singer uploaded wins.
- [x] Server tests cover the edit and cover-upload endpoints

## Comments

**Implemented.**
- `PUT /api/tracks/:id/details` with `{ title, artist }` (trimmed; blank artist becomes none; title required, each field at most 300 characters).
- `PUT /api/tracks/:id/cover` with a multipart `file`. The type is judged by the file's bytes: PNG, JPEG or WebP only. SVG is refused because an uploaded SVG could carry script the app would then serve itself. The limit is 8 MB, the same as album art.
- The Track screen has a pencil button beside the title that opens an Edit Track dialog with the title, the artist and a cover picker.

**Keeping edits:** three new flags on the Track, `title_edited`, `artist_edited` and `cover_edited` (migration `0016_track_edits`), each set only when that value actually changes. While a flag is set:
- confirming a Song keeps the singer's artist;
- album art doesn't replace an uploaded cover;
- a retried import keeps the singer's title and cover, and doesn't download the YouTube thumbnail over the cover.

A Track still on its generated placeholder gets the placeholder redrawn with the new title's first letter.

**Decided:** a cover the singer uploaded wins over album art (the suggested default).

**Not verified by eye:** the dialog. The browser automation couldn't open the local dev server. The endpoints were exercised against a running dev server and the page's server-rendered markup was checked. Worth a click-through.

**After review:**
- **Sing screen header:** it prefers a title or artist the singer typed over the confirmed Song's names. Before this, it always showed the Song once one was confirmed.
- **Cover upload during an import:** refused with a 409, and the dialog's cover picker is disabled until the import finishes. An import writes the Source's artwork into the same `cover.*` files, so a mid-import upload could be overwritten on disk.
- **Album art:** before writing, it checks `cover_edited` again after its fetch, in case the singer uploaded a cover while the fetch ran.
- **Partial save:** if the title and artist save but the cover is then refused, the page still refreshes to show the new name.
