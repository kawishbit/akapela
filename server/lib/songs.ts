import { guessSongs, type Song, type SongGuess } from '../../shared/song'
import type { LyricsProviderName } from '../../shared/lyrics'
import type { SongMatch } from '../lyrics/provider'
import { lyricsProviderNamed } from './lyrics'
import type { Presto } from './presto'
import {
  ManualLyricsOverwriteError,
  fetchLyricsForTrack,
  overwritesManualLyrics,
  withAlbumArt,
} from './track-lyrics'
import { confirmedSong, saveSong, type TrackDetail, type TrackWithJob } from './tracks'

/** What the Track detail page shows: the guess it searched for, where it looked, and what came back. */
export interface SongSearch extends SongGuess {
  /** The Lyrics Provider the matches came from, which is the Track's own. */
  provider: LyricsProviderName
  matches: SongMatch[]
}

/**
 * The Songs that might be this Track's, best first, as its Lyrics Provider
 * knows them. A guess typed by the singer wins; otherwise the confirmed Song
 * is tried, then the artist and title read out of the Track's title, in both
 * orders. The first guess the provider recognises is the one whose matches
 * come back, so the page also knows what to put in the hand-edit fields.
 *
 * A Track set to Manual searches nowhere: its Song is whatever the singer says
 * it is.
 */
export async function searchSongs(
  presto: Presto,
  track: TrackWithJob,
  requested: Partial<SongGuess> = {},
): Promise<SongSearch> {
  const guesses = requestedGuess(requested) ?? trackGuesses(track)
  const first = guesses[0] ?? { artist: '', title: '' }
  const empty = { ...first, provider: track.lyricsProvider, matches: [] }
  if (!first.title) return empty

  const provider = lyricsProviderNamed(presto, track.lyricsProvider)
  if (!provider) return empty

  for (const guess of guesses) {
    const matches = await provider.searchSongs({ ...guess, durationMs: track.durationMs })
    if (matches.length) return { ...guess, provider: provider.name, matches }
  }
  return empty
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
 * Confirms the Song a Track represents and fetches its Lyrics from the Track's
 * Lyrics Provider. Whatever the Track had before is replaced, so changing the
 * Song later never leaves the previous Song's words behind, and a Song that
 * came with album art brings it to the Track's cover.
 */
export async function confirmSong(
  presto: Presto,
  track: TrackWithJob,
  song: Song,
  options: { overwriteManual?: boolean } = {},
): Promise<TrackDetail> {
  // Checked before the Song is stored, so a refusal changes nothing at all.
  if (!options.overwriteManual && overwritesManualLyrics(presto, track, track.lyricsProvider)) {
    throw new ManualLyricsOverwriteError()
  }
  const confirmed = await withAlbumArt(presto, saveSong(presto, track, song))
  return fetchLyricsForTrack(presto, confirmed, { overwriteManual: true })
}
