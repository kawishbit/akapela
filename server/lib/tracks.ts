import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  jobs,
  tracks,
  type Job,
  type Lyrics,
  type SourceKind,
  type Take,
  type Track,
} from '../db/schema'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../../shared/adjustments'
import { DEFAULT_BACKING_SOURCE, type BackingSource } from '../../shared/backing-source'
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
import { listMixesForTrack, type MixWithJob } from './mixes'
import type { Akapela } from './akapela'
import { getSettings } from './settings'
import { listTakes } from './takes'

/**
 * Which file each Backing Source names inside the Track directory, both
 * normalized 44.1 kHz stereo WAVs the worker writes (ADR 0005) and named to
 * match `worker/akapela_worker/separators.py`, which is what writes them. The
 * Vocals Stem a separation also writes is kept but nothing plays it, so it is
 * not a Backing Source and is not here.
 */
const BACKING_SOURCE_FILES: Record<BackingSource, string> = {
  original: 'backing.wav',
  instrumental: 'instrumental.wav',
}

/**
 * The Vocals Stem a separation writes alongside the Instrumental one. Never a
 * Backing Source — nothing plays it — but Delete Stems removes it too, since
 * it is still ~80 MB (ADR 0005) of disk a Track someone keeps has no more use
 * for once its Instrumental Stem is gone.
 */
const VOCALS_STEM_FILE = 'vocals.wav'

/** A Track together with its most recent import Job, which carries import progress and error. */
export type TrackWithJob = Track & { job: Job | null }

/** What the separate routes answer with: the Track as it now is, and the Job that will do the work. */
export type TrackWithSeparationJob = TrackWithJob & { separationJob: Job }

/** Everything the Track detail and Sing pages need in one response. */
export type TrackDetail = TrackWithJob & {
  /**
   * The most recent separate Job, which carries what `separation_state` cannot:
   * how long the run has been going, and why the last one failed. Null until
   * separation has ever been asked for on this Track.
   */
  separationJob: Job | null
  lyrics: Lyrics | null
  /**
   * Whether this Track has an Instrumental Stem on disk to sing over, which is
   * what decides whether there is a Backing Source to choose between at all.
   */
  hasStems: boolean
  /** Combined size of both Stem files on disk, in bytes; 0 once there are none. Delete Stems reads this to say what it will reclaim. */
  stemsBytes: number
  /** Newest first. */
  takes: Take[]
  /** Every Mix of every Take on this Track, newest first, each with its render Job. */
  mixes: MixWithJob[]
  /**
   * Why the Lyrics Provider could not be asked, when a request that would have
   * fetched Lyrics failed. Never stored; absent unless this response tried.
   */
  lyricsError?: string
}

/** Absolute path of the directory owning every file of one Track. */
export function trackDir(akapela: Akapela, trackId: string): string {
  return join(akapela.dataDir, 'tracks', trackId)
}

/**
 * Creates a Track from an uploaded file: writes the original as delivered
 * under the Track's directory, then starts the import the worker turns into
 * a Backing Track.
 */
export function createTrackFromUpload(
  akapela: Akapela,
  input: { filename: string, bytes: Uint8Array },
): TrackWithJob {
  const ext = uploadExtension(input.filename)
  if (!ext) throw new Error(UNSUPPORTED_UPLOAD_MESSAGE)

  const id = randomUUID()
  const dir = trackDir(akapela, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `original.${ext}`), input.bytes)

  return startImport(akapela, {
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
export function createTrackFromYoutube(akapela: Akapela, input: { url: string }): TrackWithJob {
  const videoId = youtubeVideoId(input.url)
  if (!videoId) throw new Error(INVALID_YOUTUBE_URL_MESSAGE)

  return startImport(akapela, {
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
  akapela: Akapela,
  input: { id: string, title: string, sourceKind: SourceKind, sourceRef: string },
): TrackWithJob {
  const dir = trackDir(akapela, input.id)
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
    separationState: 'none',
    backingSource: DEFAULT_BACKING_SOURCE,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    songArtist: null,
    songTitle: null,
    songProviderIds: null,
    songAlbumArtUrl: null,
    // New Tracks start where the singer said Lyrics should come from.
    lyricsProvider: getSettings(akapela).defaultLyricsProvider,
    lyricsOffsetMs: 0,
    createdAt: now,
    updatedAt: now,
  }
  akapela.db.insert(tracks).values(track).run()
  const job = enqueueJob(akapela, { type: 'import', targetId: input.id })
  return { ...track, job }
}

/**
 * The id of the most recently created import Job targeting a Track, as a
 * correlated subquery. Narrowed to imports because two kinds of Job now target
 * a Track — the import and the Separation — and a card asking about one must
 * not be handed the other.
 */
const latestImportJobId = sql<string | null>`(
  select j.id from jobs j
  where j.target_id = ${tracks.id} and j.type = 'import'
  order by j.created_at desc, j.rowid desc
  limit 1
)`

function selectTracksWithJob(akapela: Akapela) {
  return akapela.db
    .select({ track: tracks, job: jobs })
    .from(tracks)
    .leftJoin(jobs, eq(jobs.id, latestImportJobId))
}

/**
 * Every Track, newest first, optionally narrowed to those whose title or artist
 * contains `query`. Matching is case-insensitive for any script, which SQLite's
 * ASCII-only `lower()` cannot do, so the (single-user sized) list is filtered here.
 */
export function listTracks(akapela: Akapela, query = ''): TrackWithJob[] {
  const needle = foldCase(query.trim())
  const rows = selectTracksWithJob(akapela)
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

export function getTrack(akapela: Akapela, id: string): TrackWithJob | undefined {
  const row = selectTracksWithJob(akapela).where(eq(tracks.id, id)).get()
  return row && { ...row.track, job: row.job }
}

/** The Track with its Lyrics and Takes, which is what opening one is for. */
export function trackDetail(akapela: Akapela, track: TrackWithJob): TrackDetail {
  return {
    ...track,
    separationJob: latestSeparationJob(akapela, track.id),
    hasStems: hasStems(akapela, track),
    stemsBytes: stemsBytes(akapela, track),
    lyrics: getLyrics(akapela, track.id),
    takes: listTakes(akapela, track.id),
    mixes: listMixesForTrack(akapela, track.id),
  }
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
export function saveSong(akapela: Akapela, track: TrackWithJob, song: Song): TrackWithJob {
  const saved = {
    songArtist: song.artist,
    songTitle: song.title,
    songProviderIds: song.providerIds,
    songAlbumArtUrl: song.albumArtUrl,
    artist: song.artist,
    updatedAt: Date.now(),
  }
  akapela.db.update(tracks).set(saved).where(eq(tracks.id, track.id)).run()
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
  akapela: Akapela,
  track: TrackWithJob,
  albumArtUrl: string,
): Promise<TrackWithJob> {
  let bytes: Uint8Array
  let ext: string | undefined
  try {
    const response = await akapela.fetch(albumArtUrl, { headers: { accept: 'image/*' } })
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

  const dir = trackDir(akapela, track.id)
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
  akapela.db.update(tracks).set({ coverPath, updatedAt }).where(eq(tracks.id, track.id)).run()
  return { ...track, coverPath, updatedAt }
}

/**
 * Saves the Lyrics Provider this Track's Lyrics are looked up in, which the
 * singer changes per Track because one Song is on Genius and the next on
 * LRCLIB.
 */
export function saveLyricsProvider(
  akapela: Akapela,
  track: TrackWithJob,
  lyricsProvider: LyricsProviderName,
): TrackWithJob {
  if (track.lyricsProvider === lyricsProvider) return track
  const now = Date.now()
  akapela.db
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
export function saveLyricsOffset(akapela: Akapela, track: TrackWithJob, lyricsOffsetMs: number): TrackWithJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ lyricsOffsetMs, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, lyricsOffsetMs, updatedAt: now }
}

/** Deletes the Track's rows, its jobs, and its directory. Returns false when no such Track exists. */
export function deleteTrack(akapela: Akapela, id: string): boolean {
  const deleted = akapela.db.transaction((tx) => {
    const removed = tx.delete(tracks).where(eq(tracks.id, id)).returning({ id: tracks.id }).all()
    if (removed.length === 0) return false
    tx.delete(jobs).where(eq(jobs.targetId, id)).run()
    return true
  })
  if (deleted) rmSync(trackDir(akapela, id), { recursive: true, force: true })
  return deleted
}

/** Remembers the Adjustments last used on a Track so they come back when it is opened again. */
export function saveAdjustments(akapela: Akapela, track: TrackWithJob, adjustments: Adjustments): TrackWithJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ adjustments, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, adjustments, updatedAt: now }
}

/**
 * Absolute path of the audio a Backing Source names on one Track. `source`
 * overrides what the Track remembers, which is how one is auditioned without
 * changing what the Track sings over next time (`../api/tracks/[id]/backing.get`).
 */
export function backingTrackPath(akapela: Akapela, track: Track, source: BackingSource = track.backingSource): string {
  return join(trackDir(akapela, track.id), BACKING_SOURCE_FILES[source])
}

/**
 * Whether this Track has an Instrumental Stem to sing over. The file itself is
 * the answer, because `separation_state` cannot be: a Track that was separated,
 * switched back to its original audio, and is now being separated again reads
 * exactly like one being separated for the first time, and yet the Stems of the
 * earlier run are still there and still playable — the worker keeps them until
 * a new run has produced replacements.
 */
export function hasStems(akapela: Akapela, track: Track): boolean {
  return existsSync(backingTrackPath(akapela, track, 'instrumental'))
}

/** Absolute paths of both Stem files a separation writes, whether or not they exist. */
function stemPaths(akapela: Akapela, track: Track): string[] {
  const dir = trackDir(akapela, track.id)
  return [join(dir, BACKING_SOURCE_FILES.instrumental), join(dir, VOCALS_STEM_FILE)]
}

/**
 * Combined size of a Track's Stem files on disk, which is what Delete Stems
 * offers to reclaim before the singer confirms it. Zero once there are none.
 */
export function stemsBytes(akapela: Akapela, track: Track): number {
  return stemPaths(akapela, track).reduce((total, path) => {
    try {
      return total + statSync(path).size
    }
    catch {
      return total
    }
  }, 0)
}

/**
 * Removes both Stem files and puts the Track back the way it was before it
 * was ever separated: singing over its original audio, with nothing to
 * choose between. Takes and Mixes are untouched — only the Track's own state
 * and the two files move. A Mix that named the Instrumental Stem still
 * remembers having done so; re-rendering it is what has to notice the Stems
 * are gone, not this.
 */
export function deleteStems(akapela: Akapela, track: TrackWithJob): TrackWithJob {
  for (const path of stemPaths(akapela, track)) rmSync(path, { force: true })
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ backingSource: DEFAULT_BACKING_SOURCE, separationState: 'none', updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, backingSource: DEFAULT_BACKING_SOURCE, separationState: 'none', updatedAt: now }
}

/**
 * Remembers what a Track's Backing Track is taken from, so opening it again
 * gives back whatever was last sung over. The caller has already established
 * that the named source exists — only `original` always does, since a
 * separation never overwrites it.
 */
export function saveBackingSource(
  akapela: Akapela,
  track: TrackWithJob,
  backingSource: BackingSource,
): TrackWithJob {
  if (track.backingSource === backingSource) return track
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ backingSource, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, backingSource, updatedAt: now }
}

/** Puts a failed Track back into importing state and enqueues a fresh import job. */
export function retryImport(akapela: Akapela, track: Track): TrackWithJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ importState: 'importing', updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  const job = enqueueJob(akapela, { type: 'import', targetId: track.id })
  return { ...track, importState: 'importing', updatedAt: now, job }
}

/** The most recent separate Job on a Track, which is the one whose progress and error the page shows. */
function latestSeparationJob(akapela: Akapela, trackId: string): Job | null {
  return akapela.db
    .select()
    .from(jobs)
    .where(and(eq(jobs.targetId, trackId), eq(jobs.type, 'separate')))
    .orderBy(desc(jobs.createdAt), desc(sql`${jobs}.rowid`))
    .limit(1)
    .get() ?? null
}

/**
 * Puts a Track into separating state and enqueues the separate job that writes
 * its Stems. Both asking for the first separation and retrying a failed one end
 * here; only the guard in front of them differs, since re-separating is
 * deliberately allowed (a better model later should not mean re-importing).
 */
export function startSeparation(akapela: Akapela, track: TrackWithJob): TrackWithSeparationJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ separationState: 'separating', updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  const separationJob = enqueueJob(akapela, { type: 'separate', targetId: track.id })
  return { ...track, separationState: 'separating', updatedAt: now, separationJob }
}
