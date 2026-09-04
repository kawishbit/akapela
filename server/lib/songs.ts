import { guessSongs, type Song, type SongGuess } from '../../shared/song'
import { LyricsProviderError, type FetchedLyrics, type SongMatch } from '../lyrics/provider'
import { lyricsProviderNamed, replaceLyrics } from './lyrics'
import type { Presto } from './presto'
import { confirmedSong, saveSong, type TrackDetail, type TrackWithJob } from './tracks'

/**
 * LRCLIB is the only Lyrics Provider in phase one; choosing between providers
 * per Track arrives with Genius and Manual.
 */
const LYRICS_PROVIDER = 'lrclib' as const

/** What the Track detail page shows: the guess it searched for, and what came back. */
export interface SongSearch extends SongGuess {
  matches: SongMatch[]
}

/**
 * The Songs that might be this Track's, best first. A guess typed by the
 * singer wins; otherwise the confirmed Song is tried, then the artist and
 * title read out of the Track's title, in both orders. The first guess the
 * provider recognises is the one whose matches come back, so the page also
 * knows what to put in the hand-edit fields.
 */
export async function searchSongs(
  presto: Presto,
  track: TrackWithJob,
  requested: Partial<SongGuess> = {},
): Promise<SongSearch> {
  const guesses = requestedGuess(requested) ?? trackGuesses(track)
  const first = guesses[0]
  if (!first) return { artist: '', title: '', matches: [] }

  const provider = lyricsProviderNamed(presto, LYRICS_PROVIDER)
  if (!provider) return { ...first, matches: [] }

  for (const guess of guesses) {
    const matches = await provider.searchSongs({ ...guess, durationMs: track.durationMs })
    if (matches.length) return { ...guess, matches }
  }
  return { ...first, matches: [] }
}

function requestedGuess(requested: Partial<SongGuess>): SongGuess[] | null {
  const title = requested.title?.trim() ?? ''
  if (!title) return null
  return [{ artist: requested.artist?.trim() ?? '', title }]
}

function trackGuesses(track: TrackWithJob): SongGuess[] {
  const song = confirmedSong(track)
  const fromTitle = guessSongs(track.title)
  return song ? [{ artist: song.artist, title: song.title }, ...fromTitle] : fromTitle
}

/**
 * Confirms the Song a Track represents and fetches its Lyrics. Whatever the
 * Track had before is replaced, so changing the Song later never leaves the
 * previous Song's words behind. A provider that cannot be reached leaves the
 * existing Lyrics alone and says why.
 */
export async function confirmSong(presto: Presto, track: TrackWithJob, song: Song): Promise<TrackDetail> {
  const confirmed = saveSong(presto, track, song)
  const provider = lyricsProviderNamed(presto, LYRICS_PROVIDER)

  let found: FetchedLyrics | null = null
  let lyricsError: string | undefined
  if (provider) {
    try {
      found = await provider.fetchLyrics(song)
    }
    catch (error) {
      lyricsError = error instanceof LyricsProviderError ? error.message : String(error)
    }
  }

  // The Lyrics on a Track always belong to the Song confirmed on it, so the
  // ones the Song before had go even when nothing arrives to replace them.
  // Confirming again is how a singer retries a provider that was down.
  const lyrics = replaceLyrics(presto, track.id, found && { provider: LYRICS_PROVIDER, ...found })
  return lyricsError === undefined ? { ...confirmed, lyrics } : { ...confirmed, lyrics, lyricsError }
}
