# 06: Genius and Manual Lyrics Providers

**What to build:** A singer can choose Genius instead of LRCLIB for a Track, because Genius text is usually more accurate. Genius search and metadata come from its API and the lyrics text from the song page, behind the same provider interface. When a Song is confirmed via Genius, the Track's cover art becomes the album art. A singer can also paste Lyrics by hand as the Manual provider, edit fetched Lyrics and have them become Manual, and is asked before a refetch overwrites Manual Lyrics. The screen shows which provider the current Lyrics came from, and a no-lyrics message offers a paste shortcut. A default provider can be set.

**Blocked by:** 05 (Song identification and Lyrics screen via LRCLIB)

**Status:** done

- [x] The Genius provider searches and reads Song metadata through the Genius API using a token from an environment variable, and fetches lyrics text by scraping the song page; the scraper is isolated so it can be fixed alone
- [x] When no Genius token is configured the provider reports itself unavailable and the UI hides it; LRCLIB and Manual keep working
- [x] The singer picks the Lyrics Provider per Track on the Track detail page; a default provider is stored in the database and applied to new Tracks
- [x] Confirming a Song via Genius replaces the Track's cover art with the album art
- [x] Manual Lyrics can be pasted as plain text lines and are stored with provider Manual and kind Plain
- [x] Editing any fetched Lyrics text saves them with provider Manual
- [x] Refetching from a provider when the current provider is Manual requires confirmation before overwriting
- [x] The Sing page and Track detail page show the provider of the current Lyrics
- [x] When no provider has Lyrics for the Song, the Track page says so and offers a shortcut to paste
- [x] API tests use fakes for both remote providers and cover provider selection, unavailability without a token, Manual paste, edit-becomes-Manual, the overwrite confirmation, and cover art replacement
