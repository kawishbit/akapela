import { randomUUID } from 'node:crypto'
import { CodedError, failure, type ErrorCode } from '../../shared/error-codes'
import { parsePlaylistLink, type PlaylistKind, type PlaylistLink } from '../../shared/playlist-link'
import { lyricsSearchTitle, type Song } from '../../shared/song'
import type { SongMatch } from '../lyrics/provider'
import type { Akapela } from './akapela'
import type { PlaylistImportFollowUp } from './jobs/import-track'
import { playlistImportOf, type PlaylistImportLabel } from './jobs'
import { replaceLyrics, lyricsProviderNamed } from './lyrics'
import type { PlaylistSong } from './playlists'
import { defaultSeparationModelOf } from './settings'
import { DEFAULT_SEPARATION_MODEL, type SeparationModelName } from './separators/models'
import {
  createTrackFromPlaylistSong,
  getTrack,
  replaceCoverWithAlbumArt,
  startSeparation,
  trackWithSong,
  type TrackWithJob,
} from './tracks'

/**
 * A Playlist Import: many Tracks at once from a playlist or album on another
 * service (CONTEXT.md). The checklist is previewed first, then the chosen
 * songs become Tracks, each with its own import Job; that Job finds the song
 * on YouTube, downloads it, and then `followUp` fetches its Lyrics and queues
 * its Separation. The playlist itself is not kept: its Jobs only remember its
 * name, as their label.
 */

export const INVALID_PLAYLIST_LINK_MESSAGE = 'Paste a link to a Spotify playlist or album'

/** Where a song stands in the checklist. */
export type PreviewSongState = 'new' | 'inLibrary' | 'duplicate'

export interface PreviewSong extends PlaylistSong {
  state: PreviewSongState
  /** The Track that already has this Song, when it is `inLibrary`. */
  trackId?: string
}

/** Everything the checklist page needs, in one request. */
export interface PlaylistPreview {
  name: string
  kind: PlaylistKind
  total: number | null
  songs: PreviewSong[]
  /**
   * How long a Separation takes per millisecond of audio on this install, for
   * the estimate: the page multiplies it by the ticked songs' durations.
   */
  separationMsPerAudioMs: number
}

/** The link in `url`, or a refusal the page shows as `invalidPlaylistLink`. */
export function requirePlaylistLink(url: unknown): PlaylistLink {
  const link = typeof url === 'string' ? parsePlaylistLink(url) : null
  if (!link) throw new CodedError(failure('invalidPlaylistLink'), INVALID_PLAYLIST_LINK_MESSAGE)
  return link
}

/** Two Songs are the same when their artist and title are, once trimmed (`trackWithSong`). */
function songKey(song: Pick<Song, 'artist' | 'title'>): string {
  return `${song.artist.trim()}\u0000${song.title.trim()}`
}

/**
 * Reads the playlist and says, song by song, whether importing it would make
 * a new Track. A Song another Track has is `inLibrary`, with that Track; one
 * that appears earlier in this playlist is `duplicate`. Neither can be ticked.
 */
export async function previewPlaylist(akapela: Akapela, url: unknown, signal?: AbortSignal): Promise<PlaylistPreview> {
  const link = requirePlaylistLink(url)
  const playlist = await akapela.playlistReader.read(link, signal)
  const seen = new Set<string>()
  const songs = playlist.songs.map((song): PreviewSong => {
    const inLibrary = trackWithSong(akapela, song)
    const key = songKey(song)
    const duplicate = seen.has(key)
    seen.add(key)
    if (inLibrary) return { ...song, state: 'inLibrary', trackId: inLibrary.id }
    return { ...song, state: duplicate ? 'duplicate' : 'new' }
  })
  return {
    name: playlist.name,
    kind: playlist.kind,
    total: playlist.total,
    songs,
    separationMsPerAudioMs: separationMsPerAudioMs(recentSeparations(akapela, defaultSeparationModelOf(akapela))),
  }
}

/** One succeeded Separation, as the estimate reads it. */
export interface SeparationSample {
  /** How long it ran, from starting to finishing. */
  elapsedMs: number
  /** How long its Track is. */
  durationMs: number
}

/** About 70 s per 4 minutes of audio: the CPU figure in `ROADMAP.md`, for an install with nothing to go on. */
export const FALLBACK_SEPARATION_MS_PER_AUDIO_MS = 70 / 240

/** How many of the latest Separations the estimate averages. */
export const SEPARATION_SAMPLES = 10

/**
 * The average of how long each Separation took per millisecond of its Track,
 * or the fallback with none to go on. Samples that could not have been timed
 * are left out.
 */
export function separationMsPerAudioMs(samples: readonly SeparationSample[]): number {
  const ratios = samples
    .filter(sample => sample.durationMs > 0 && sample.elapsedMs > 0)
    .map(sample => sample.elapsedMs / sample.durationMs)
  if (ratios.length === 0) return FALLBACK_SEPARATION_MS_PER_AUDIO_MS
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
}

/**
 * This install's latest succeeded Separations with one Separation Model,
 * newest first. A Job from before there was a choice ran the default model,
 * and counts as it.
 */
export function recentSeparations(akapela: Akapela, model: SeparationModelName): SeparationSample[] {
  return akapela.sqlite
    .prepare(
      `SELECT j.finished_at - j.started_at AS elapsedMs, t.duration_ms AS durationMs
       FROM jobs j JOIN tracks t ON t.id = j.target_id
       WHERE j.type = 'separate' AND j.state = 'succeeded'
         AND coalesce(j.separation_model, ?) = ?
         AND j.started_at IS NOT NULL AND j.finished_at IS NOT NULL AND t.duration_ms IS NOT NULL
       ORDER BY j.finished_at DESC, j.rowid DESC
       LIMIT ?`,
    )
    .all(DEFAULT_SEPARATION_MODEL, model, SEPARATION_SAMPLES) as SeparationSample[]
}

/** A chosen song that was not imported, because another Track has its Song by now. */
export interface SkippedSong extends PlaylistSong {
  trackId: string
}

export interface StartedPlaylistImport {
  playlistImportId: string
  created: TrackWithJob[]
  skipped: SkippedSong[]
}

/**
 * Starts a Playlist Import of the songs ticked in the checklist, named by
 * their service ids. The playlist is read again rather than trusting songs
 * sent from the browser.
 *
 * One transaction, song by song: a song whose Song another Track has by now
 * is skipped and said to be — another import of the same playlist may have
 * raced this one — and every other becomes a Track with its Song confirmed
 * and its own import Job, labelled with this Playlist Import.
 */
export async function startPlaylistImport(
  akapela: Akapela,
  input: { url: unknown, serviceIds: readonly string[] },
  signal?: AbortSignal,
): Promise<StartedPlaylistImport> {
  const link = requirePlaylistLink(input.url)
  const playlist = await akapela.playlistReader.read(link, signal)
  const chosen = new Set(input.serviceIds)
  const label: PlaylistImportLabel = { id: randomUUID(), name: playlist.name }

  return akapela.db.transaction(() => {
    const created: TrackWithJob[] = []
    const skipped: SkippedSong[] = []
    for (const song of playlist.songs) {
      if (!chosen.delete(song.serviceId)) continue
      const other = trackWithSong(akapela, song)
      if (other) {
        skipped.push({ ...song, trackId: other.id })
        continue
      }
      created.push(createTrackFromPlaylistSong(akapela, song, label))
    }
    return { playlistImportId: label.id, created, skipped }
  }, { behavior: 'immediate' })
}

/** How long the Lyrics Provider is given before the Track goes on without Lyrics. */
const LYRICS_TIMEOUT_MS = 30_000

/**
 * What a Playlist Import's Track gets once its Backing Track is in place, run
 * by its import Job: Lyrics from its Lyrics Provider, then a Separation with
 * the default Separation Model, carrying the same label. A failure to find
 * Lyrics is logged and the Separation still queued.
 */
export function playlistImportFollowUp(akapela: Akapela): PlaylistImportFollowUp {
  return async (ctx, trackId, spotifyDurationMs) => {
    const track = getTrack(akapela, trackId)
    if (!track) return
    try {
      await fetchPlaylistSongLyrics(akapela, track, spotifyDurationMs)
    }
    catch (error) {
      if (ctx.signal.aborted) return
      console.warn(`Lyrics for Track ${trackId} could not be fetched:`, error)
    }
    ctx.signal.throwIfAborted()
    const current = getTrack(akapela, trackId)
    // The singer may have asked for one already, while the Lyrics were looked up.
    if (!current || current.separationState === 'separating' || current.separationState === 'ready') return
    startSeparation(akapela, current, defaultSeparationModelOf(akapela), playlistImportOf(ctx.job))
  }
}

/**
 * Looks the Track's confirmed Song up on its Lyrics Provider and stores what
 * it has. The search drops an edition note from the title (`lyricsSearchTitle`)
 * and tries the first artist alone when several are listed, since a provider
 * lists a song once rather than once per remaster; the Song stored on the
 * Track stays exactly what Spotify said. The provider's handle for the match
 * is kept, so fetching again finds the same one.
 */
export async function fetchPlaylistSongLyrics(
  akapela: Akapela,
  track: TrackWithJob,
  durationMs: number | null,
): Promise<void> {
  if (!track.songTitle || track.lyricsProvider === 'manual') return
  const provider = lyricsProviderNamed(akapela, track.lyricsProvider)
  if (!provider) return

  const title = lyricsSearchTitle(track.songTitle)
  const artist = track.songArtist ?? ''
  const firstArtist = artist.split(',')[0]!.trim()
  const artists = firstArtist && firstArtist !== artist.trim() ? [artist, firstArtist] : [artist]

  const lookUp = async () => {
    let match: SongMatch | undefined
    for (const each of artists) {
      match = (await provider.searchSongs({ artist: each, title, durationMs }))[0]
      if (match) break
    }
    const song: Song = match ?? { artist, title, providerIds: {}, albumArtUrl: null }
    return { match, lyrics: await provider.fetchLyrics(song) }
  }
  const { match, lyrics } = await withTimeout(lookUp(), LYRICS_TIMEOUT_MS)

  if (match) {
    akapela.sqlite
      .prepare(`UPDATE tracks SET song_provider_ids = ?, song_album_art_url = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify({ ...track.songProviderIds, ...match.providerIds }), match.albumArtUrl, Date.now(), track.id)
    if (match.albumArtUrl) await replaceCoverWithAlbumArt(akapela, track, match.albumArtUrl)
  }
  if (lyrics) replaceLyrics(akapela, track.id, { provider: provider.name, ...lyrics })
}

/** The HTTP status each refusal to read a playlist answers with. */
const REFUSAL_STATUS: Partial<Record<ErrorCode, number>> = {
  invalidPlaylistLink: 400,
  playlistNotFound: 404,
  playlistTooLong: 422,
  playlistUnreadable: 502,
}

/**
 * What a Playlist Import route answers a failure with: a refusal keeps its
 * code, and anything else about reaching the service reads as `unexpected`
 * with its English as the Details.
 */
export function playlistRefusal(error: unknown): { statusCode: number, failure: CodedError['failure'], message: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof CodedError) {
    const statusCode = REFUSAL_STATUS[error.code as ErrorCode]
    if (statusCode) return { statusCode, failure: error.failure, message }
  }
  return { statusCode: 502, failure: failure('unexpected'), message }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
