/**
 * The Lyrics of one Track: where they come from, and what happens when that
 * changes. Storing them is `lib/lyrics`; reaching a provider is
 * `lyrics/provider`; this is the middle, where a singer's choice of Lyrics
 * Provider meets the words already on the Track.
 */

import { parseManualLyricsText, unavailableProviderMessage, type LyricsProviderName } from '../../shared/lyrics'
import { LyricsProviderError, type FetchedLyrics } from '../lyrics/provider'
import { getLyrics, lyricsProviderNamed, replaceLyrics } from './lyrics'
import { listMixesForTrack } from './mixes'
import type { Presto } from './presto'
import { listTakes } from './takes'
import {
  confirmedSong,
  replaceCoverWithAlbumArt,
  saveLyricsProvider,
  trackDetail,
  type TrackDetail,
  type TrackWithJob,
} from './tracks'

export const MANUAL_LYRICS_OVERWRITE_MESSAGE
  = 'These Lyrics were typed by hand. Fetching from a provider replaces them.'

/**
 * Raised when fetching would throw away Lyrics the singer typed. Words nobody
 * else has are the ones worth asking about, so the request comes back
 * unapplied and the page asks before sending it again.
 */
export class ManualLyricsOverwriteError extends Error {
  constructor() {
    super(MANUAL_LYRICS_OVERWRITE_MESSAGE)
    this.name = 'ManualLyricsOverwriteError'
  }
}

/**
 * Whether fetching from this provider would throw away words the singer typed.
 * Manual is never fetched from, so choosing it can lose nothing.
 */
export function overwritesManualLyrics(
  presto: Presto,
  track: TrackWithJob,
  name: LyricsProviderName,
): boolean {
  return name !== 'manual' && getLyrics(presto, track.id)?.provider === 'manual'
}

export interface FetchLyricsOptions {
  /** The provider to fetch from; the Track's own when this is left out. */
  provider?: LyricsProviderName
  /** The singer has been asked, and said to replace Lyrics they typed. */
  overwriteManual?: boolean
}

/**
 * Fetches a Track's Lyrics from a Lyrics Provider, which is what picking a
 * provider and asking for the words again both come down to. The provider
 * becomes the Track's, so a Song only Genius has stays on Genius next time.
 *
 * Manual is not fetched from: choosing it says the singer will type the words,
 * so whatever is on the Track is left alone.
 */
export async function fetchLyricsForTrack(
  presto: Presto,
  track: TrackWithJob,
  options: FetchLyricsOptions = {},
): Promise<TrackDetail> {
  const name = options.provider ?? track.lyricsProvider
  const song = confirmedSong(track)
  // A Track with no confirmed Song has nothing to look up yet, so picking a
  // provider only records where to look once it has one.
  const fetching = name !== 'manual' && song !== null
  if (fetching && !options.overwriteManual && overwritesManualLyrics(presto, track, name)) {
    throw new ManualLyricsOverwriteError()
  }

  const chosen = saveLyricsProvider(presto, track, name)
  if (!song || name === 'manual') return trackDetail(presto, chosen)

  const provider = lyricsProviderNamed(presto, name)
  // The Track was set to a provider this instance has since lost, so the
  // singer is told rather than left wondering why nothing arrived.
  if (!provider) return { ...trackDetail(presto, chosen), lyricsError: unavailableProviderMessage(name) }

  let found: FetchedLyrics | null = null
  let lyricsError: string | undefined
  try {
    found = await provider.fetchLyrics(song)
  }
  catch (error) {
    lyricsError = error instanceof LyricsProviderError ? error.message : String(error)
  }

  // The Lyrics on a Track always belong to the Song confirmed on it, so the
  // ones the Song before had go even when nothing arrives to replace them.
  // Asking again is how a singer retries a provider that was down.
  const stored = replaceLyrics(presto, chosen.id, found && { provider: name, ...found })
  const detail = {
    ...chosen,
    lyrics: stored,
    takes: listTakes(presto, chosen.id),
    mixes: listMixesForTrack(presto, chosen.id),
  }
  return lyricsError === undefined ? detail : { ...detail, lyricsError }
}

/**
 * The Track with the confirmed Song's album art as its cover, when the Song
 * came with any. Genius is the provider that has it; LRCLIB has none, so its
 * Songs leave the Source's own artwork in place. Done as the Song is confirmed
 * rather than on every fetch, since the art belongs to the Song and asking the
 * Lyrics again does not change it.
 */
export async function withAlbumArt(presto: Presto, track: TrackWithJob): Promise<TrackWithJob> {
  const albumArtUrl = confirmedSong(track)?.albumArtUrl
  return albumArtUrl ? replaceCoverWithAlbumArt(presto, track, albumArtUrl) : track
}

/**
 * Stores Lyrics the singer typed or pasted. They are Plain, since a singer
 * types words and not timings, and their provider is Manual however they got
 * there: editing what a provider fetched makes the words the singer's own, and
 * a later fetch has to ask before replacing them.
 */
export function saveManualLyrics(presto: Presto, track: TrackWithJob, text: unknown): TrackDetail {
  const lines = parseManualLyricsText(text)
  const owned = saveLyricsProvider(presto, track, 'manual')
  return {
    ...owned,
    lyrics: replaceLyrics(presto, owned.id, { provider: 'manual', kind: 'plain', lines }),
    takes: listTakes(presto, owned.id),
    mixes: listMixesForTrack(presto, owned.id),
  }
}
