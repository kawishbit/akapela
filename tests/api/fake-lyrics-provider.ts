import type { FetchedLyrics, LyricsProvider, SongMatch } from '../../server/lyrics/provider'

/** What the fake will answer with, set per test before the call that reads it. */
export interface CannedLyricsProvider {
  /** Every Song the fake knows. A search returns those whose title it was asked for. */
  songs: SongMatch[]
  /** Lyrics per Song title, lower-cased. A Song not listed here has none. */
  lyrics: Record<string, FetchedLyrics>
  /** When set, the matching call rejects with it instead of answering. */
  searchError: Error | null
  fetchError: Error | null
}

/**
 * A Lyrics Provider standing in for LRCLIB, so API tests exercise Song
 * identification and Lyrics fetching without the network. It matches a search
 * on the title alone, which is what makes a wrong reading of a video title
 * ("Yesterday - The Beatles" read artist-first) come back empty.
 */
export function createFakeLyricsProvider(): { provider: LyricsProvider, canned: CannedLyricsProvider } {
  const canned: CannedLyricsProvider = {
    songs: [],
    lyrics: {},
    searchError: null,
    fetchError: null,
  }

  const provider: LyricsProvider = {
    name: 'lrclib',

    async searchSongs(query) {
      if (canned.searchError) throw canned.searchError
      const wanted = query.title.trim().toLowerCase()
      return canned.songs.filter(song => song.title.toLowerCase() === wanted)
    },

    async fetchLyrics(song) {
      if (canned.fetchError) throw canned.fetchError
      return canned.lyrics[song.title.toLowerCase()] ?? null
    },
  }

  return { provider, canned }
}

/** A Song the fake knows, with the detail a real provider would fill in. */
export function fakeSongMatch(artist: string, title: string, extra: Partial<SongMatch> = {}): SongMatch {
  return {
    artist,
    title,
    album: null,
    durationMs: null,
    instrumental: false,
    providerIds: { lrclib: `${artist}:${title}` },
    albumArtUrl: null,
    ...extra,
  }
}
