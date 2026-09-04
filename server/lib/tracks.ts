import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { desc, eq, sql } from 'drizzle-orm'
import { jobs, tracks, type Job, type Lyrics, type SourceKind, type Track } from '../db/schema'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../../shared/adjustments'
import { UNSUPPORTED_UPLOAD_MESSAGE, uploadExtension } from '../../shared/upload'
import {
  INVALID_YOUTUBE_URL_MESSAGE,
  canonicalYoutubeUrl,
  youtubePlaceholderTitle,
  youtubeVideoId,
} from '../../shared/youtube'
import type { Song } from '../../shared/song'
import type { LyricsProviderName } from '../../shared/lyrics'
import { COVER_BASENAME, coverExtension, placeholderCoverSvg } from './cover'
import { enqueueJob } from './jobs'
import { getLyrics } from './lyrics'
import type { Presto } from './presto'
import { getSettings } from './settings'

/** Filename of the normalized 44.1 kHz stereo WAV the worker writes into the Track directory (ADR 0005). */
export const BACKING_TRACK_FILE = 'backing.wav'

/** A Track together with its most recent Job, which carries import progress and error. */
export type TrackWithJob = Track & { job: Job | null }

/** Everything the Track detail and Sing pages need in one response. */
export type TrackDetail = TrackWithJob & {
  lyrics: Lyrics | null
  /**
   * Why the Lyrics Provider could not be asked, when a request that would have
   * fetched Lyrics failed. Never stored; absent unless this response tried.
   */
  lyricsError?: string
}

/** Absolute path of the directory owning every file of one Track. */
export function trackDir(presto: Presto, trackId: string): string {
  return join(presto.dataDir, 'tracks', trackId)
}

/**
 * Creates a Track from an uploaded file: writes the original as delivered
 * under the Track's directory, then starts the import the worker turns into
 * a Backing Track.
 */
export function createTrackFromUpload(
  presto: Presto,
  input: { filename: string, bytes: Uint8Array },
): TrackWithJob {
  const ext = uploadExtension(input.filename)
  if (!ext) throw new Error(UNSUPPORTED_UPLOAD_MESSAGE)

  const id = randomUUID()
  const dir = trackDir(presto, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `original.${ext}`), input.bytes)

  return startImport(presto, {
    id,
    title: input.filename.slice(0, -(ext.length + 1)).trim() || input.filename,
    sourceKind: 'upload',
    sourceRef: input.filename,
  })
}

/**
 * Creates a Track from a YouTube URL. The Track carries a stand-in title until
 * the worker fetches the video's own title and thumbnail, which it does before
 * downloading the audio so the card fills in early.
 */
export function createTrackFromYoutube(presto: Presto, input: { url: string }): TrackWithJob {
  const videoId = youtubeVideoId(input.url)
  if (!videoId) throw new Error(INVALID_YOUTUBE_URL_MESSAGE)

  return startImport(presto, {
    id: randomUUID(),
    title: youtubePlaceholderTitle(videoId),
    sourceKind: 'youtube',
    sourceRef: canonicalYoutubeUrl(videoId),
  })
}

/**
 * Writes a placeholder cover into the Track's directory, inserts the Track in
 * importing state, and enqueues the import job.
 */
function startImport(
  presto: Presto,
  input: { id: string, title: string, sourceKind: SourceKind, sourceRef: string },
): TrackWithJob {
  const dir = trackDir(presto, input.id)
  mkdirSync(dir, { recursive: true })
  const coverPath = `${COVER_BASENAME}.svg`
  writeFileSync(join(dir, coverPath), placeholderCoverSvg(input.title))

  const now = Date.now()
  const track: Track = {
    id: input.id,
    title: input.title,
    artist: null,
    durationMs: null,
    coverPath,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    importState: 'importing',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    songArtist: null,
    songTitle: null,
    songProviderIds: null,
    songAlbumArtUrl: null,
    // New Tracks start where the singer said Lyrics should come from.
    lyricsProvider: getSettings(presto).defaultLyricsProvider,
    lyricsOffsetMs: 0,
    createdAt: now,
    updatedAt: now,
  }
  presto.db.insert(tracks).values(track).run()
  const job = enqueueJob(presto, { type: 'import', targetId: input.id })
  return { ...track, job }
}

/** The id of the most recently created Job targeting a Track, as a correlated subquery. */
const latestJobId = sql<string | null>`(
  select j.id from jobs j
  where j.target_id = ${tracks.id}
  order by j.created_at desc, j.rowid desc
  limit 1
)`

function selectTracksWithJob(presto: Presto) {
  return presto.db
    .select({ track: tracks, job: jobs })
    .from(tracks)
    .leftJoin(jobs, eq(jobs.id, latestJobId))
}

/**
 * Every Track, newest first, optionally narrowed to those whose title or artist
 * contains `query`. Matching is case-insensitive for any script, which SQLite's
 * ASCII-only `lower()` cannot do, so the (single-user sized) list is filtered here.
 */
export function listTracks(presto: Presto, query = ''): TrackWithJob[] {
  const needle = foldCase(query.trim())
  const rows = selectTracksWithJob(presto)
    .orderBy(desc(tracks.createdAt), desc(sql`${tracks}.rowid`))
    .all()
    .map(row => ({ ...row.track, job: row.job }))
  if (!needle) return rows
  return rows.filter(track =>
    foldCase(track.title).includes(needle) || foldCase(track.artist ?? '').includes(needle),
  )
}

function foldCase(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('en')
}

export function getTrack(presto: Presto, id: string): TrackWithJob | undefined {
  const row = selectTracksWithJob(presto).where(eq(tracks.id, id)).get()
  return row && { ...row.track, job: row.job }
}

/** The Track with its Lyrics, which is what opening one is for. */
export function trackDetail(presto: Presto, track: TrackWithJob): TrackDetail {
  return { ...track, lyrics: getLyrics(presto, track.id) }
}

/** The Song confirmed on a Track, or null while none is. */
export function confirmedSong(track: Track): Song | null {
  if (!track.songTitle) return null
  return {
    artist: track.songArtist ?? '',
    title: track.songTitle,
    providerIds: track.songProviderIds ?? {},
    albumArtUrl: track.songAlbumArtUrl,
  }
}

/**
 * Confirms the Song a Track represents. The Song's artist becomes the Track's
 * too, since confirming one is what gives a Track the artist the library
 * lists it by.
 */
export function saveSong(presto: Presto, track: TrackWithJob, song: Song): TrackWithJob {
  const saved = {
    songArtist: song.artist,
    songTitle: song.title,
    songProviderIds: song.providerIds,
    songAlbumArtUrl: song.albumArtUrl,
    artist: song.artist,
    updatedAt: Date.now(),
  }
  presto.db.update(tracks).set(saved).where(eq(tracks.id, track.id)).run()
  return { ...track, ...saved }
}

/** Larger than any album cover, so a body this big is not one. */
const MAX_COVER_BYTES = 8 * 1024 * 1024

/**
 * Replaces a Track's cover art with the album art of the Song confirmed on it.
 * DESIGN.md asks for exactly this: the artwork is the only colour on the Sing
 * screen, so an album cover beats a video thumbnail. Genius is the provider
 * that has album art; LRCLIB has none, so nothing happens for it.
 *
 * Artwork is a nicety, so every failure — an unreachable host, a body that is
 * not an image — leaves the Track's current cover in place: a Song is still
 * confirmed when its art will not load.
 */
export async function replaceCoverWithAlbumArt(
  presto: Presto,
  track: TrackWithJob,
  albumArtUrl: string,
): Promise<TrackWithJob> {
  let bytes: Uint8Array
  let ext: string | undefined
  try {
    const response = await presto.fetch(albumArtUrl, { headers: { accept: 'image/*' } })
    if (!response.ok) return track
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const body = await response.arrayBuffer()
    if (body.byteLength === 0 || body.byteLength > MAX_COVER_BYTES) return track
    bytes = new Uint8Array(body)
    ext = coverExtension(contentType, albumArtUrl)
  }
  catch {
    return track
  }
  if (!ext) return track

  const dir = trackDir(presto, track.id)
  const coverPath = `${COVER_BASENAME}.${ext}`
  // Written beside the old cover and moved into place, so a half-written file
  // is never what the page asks for.
  const partial = join(dir, `${COVER_BASENAME}.part`)
  writeFileSync(partial, bytes)
  renameSync(partial, join(dir, coverPath))
  // The art may be a different type than the cover it replaces.
  for (const name of readdirSync(dir)) {
    if (name.startsWith(`${COVER_BASENAME}.`) && name !== coverPath) rmSync(join(dir, name), { force: true })
  }

  const updatedAt = Date.now()
  presto.db.update(tracks).set({ coverPath, updatedAt }).where(eq(tracks.id, track.id)).run()
  return { ...track, coverPath, updatedAt }
}

/**
 * Saves the Lyrics Provider this Track's Lyrics are looked up in, which the
 * singer changes per Track because one Song is on Genius and the next on
 * LRCLIB.
 */
export function saveLyricsProvider(
  presto: Presto,
  track: TrackWithJob,
  lyricsProvider: LyricsProviderName,
): TrackWithJob {
  if (track.lyricsProvider === lyricsProvider) return track
  const now = Date.now()
  presto.db
    .update(tracks)
    .set({ lyricsProvider, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, lyricsProvider, updatedAt: now }
}

/**
 * Saves the Lyrics Offset that lines this Track's Lyrics up with its Backing
 * Track. It lives on the Track, not the Lyrics, so refetching does not reset it.
 */
export function saveLyricsOffset(presto: Presto, track: TrackWithJob, lyricsOffsetMs: number): TrackWithJob {
  const now = Date.now()
  presto.db
    .update(tracks)
    .set({ lyricsOffsetMs, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, lyricsOffsetMs, updatedAt: now }
}

/** Deletes the Track's rows, its jobs, and its directory. Returns false when no such Track exists. */
export function deleteTrack(presto: Presto, id: string): boolean {
  const deleted = presto.db.transaction((tx) => {
    const removed = tx.delete(tracks).where(eq(tracks.id, id)).returning({ id: tracks.id }).all()
    if (removed.length === 0) return false
    tx.delete(jobs).where(eq(jobs.targetId, id)).run()
    return true
  })
  if (deleted) rmSync(trackDir(presto, id), { recursive: true, force: true })
  return deleted
}

/** Remembers the Adjustments last used on a Track so they come back when it is opened again. */
export function saveAdjustments(presto: Presto, track: TrackWithJob, adjustments: Adjustments): TrackWithJob {
  const now = Date.now()
  presto.db
    .update(tracks)
    .set({ adjustments, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, adjustments, updatedAt: now }
}

/** Puts a failed Track back into importing state and enqueues a fresh import job. */
export function retryImport(presto: Presto, track: Track): TrackWithJob {
  const now = Date.now()
  presto.db
    .update(tracks)
    .set({ importState: 'importing', updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  const job = enqueueJob(presto, { type: 'import', targetId: track.id })
  return { ...track, importState: 'importing', updatedAt: now, job }
}
