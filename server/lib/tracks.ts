import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { trackDir as trackDirFor } from './jobs/track-paths'
import {
  jobs,
  tracks,
  type Job,
  type Lyrics,
  type SourceKind,
  type Take,
  type Track,
} from '../db/schema'
import { DEFAULT_ADJUSTMENTS, parseAdjustments, type Adjustments } from '../../shared/adjustments'
import {
  DEFAULT_BACKING_SOURCE,
  DEFAULT_STEM_LEVELS,
  sameStemLevels,
  type BackingSource,
  type StemLevels,
  type TrackAudioFile,
} from '../../shared/backing-source'
import { UNSUPPORTED_UPLOAD_MESSAGE, uploadExtension } from '../../shared/upload'
import {
  INVALID_YOUTUBE_URL_MESSAGE,
  canonicalYoutubeUrl,
  youtubePlaceholderTitle,
  youtubeVideoId,
} from '../../shared/youtube'
import type { Song } from '../../shared/song'
import type { TrackDetails } from '../../shared/track-details'
import type { LyricsProviderName } from '../../shared/lyrics'
import { CodedError, failure, type CodedFailure } from '../../shared/error-codes'
import { COVER_BASENAME, coverExtension, placeholderCoverSvg } from './cover'
import { enqueueJob, playlistImportOf, type PlaylistImportLabel } from './jobs'
import { getLyrics } from './lyrics'
import { listMixesForTrack, type MixWithJob } from './mixes'
import type { Akapela } from './akapela'
import { defaultLyricsProviderOf, defaultSeparationModelOf } from './settings'
import {
  audioFileCandidates,
  audioFileName,
  BACKING_BASENAME,
  findAudioFile,
  INSTRUMENTAL_BASENAME,
  VOCALS_BASENAME,
} from './audio-files'
import { DEFAULT_SEPARATION_MODEL, type SeparationModelName } from './separators/models'
import { listTakes } from './takes'

/**
 * Which file each of a Track's stored audio files is inside the Track
 * directory, by basename: the import writes the original and the separate Job
 * both Stems, each in the Audio Format in force when it did (ADR 0016), so the
 * extension is whatever is on disk (`audio-files.ts`). A Backing Source of
 * `stems` names both Stems, blended at the Stem Levels by whoever plays or
 * renders it.
 */
export const TRACK_AUDIO_BASENAMES: Record<TrackAudioFile, string> = {
  original: BACKING_BASENAME,
  instrumental: INSTRUMENTAL_BASENAME,
  vocals: VOCALS_BASENAME,
}

/** A Track together with its most recent import Job, which carries import progress and error. */
export type TrackWithJob = Track & {
  job: Job | null
  /**
   * The id of the most recent separate Job, so a Library card that is
   * separating can link to its row on the Jobs page without the whole Job.
   * Null until separation has ever been asked for.
   */
  separationJobId: string | null
}

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
  /**
   * The Separation Model that made the Stems on disk, so the Track page can
   * say "Separated with Inst_HQ_3". Null without Stems.
   */
  stemsModel: SeparationModelName | null
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
  /** What `lyricsError` says, as a code the browser puts into words (ADR 0014). */
  lyricsFailure?: CodedFailure
}

/** Absolute path of the directory owning every file of one Track. */
export function trackDir(akapela: Akapela, trackId: string): string {
  return trackDirFor(akapela.dataDir, trackId)
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
 * Creates a Track for one song of a Playlist Import: a YouTube Source with no
 * link yet, which its import Job finds by searching, Spotify's title and
 * length, and its Song confirmed from Spotify's artist and title before
 * anything is downloaded. Confirming it now is what reserves the Song, so a
 * second Playlist Import of the same playlist cannot create it again.
 *
 * The caller has already checked, in the same transaction, that no other
 * Track has this Song (`trackWithSong`).
 */
export function createTrackFromPlaylistSong(
  akapela: Akapela,
  song: { artist: string, title: string, durationMs: number },
  playlistImport: PlaylistImportLabel,
): TrackWithJob {
  const artist = song.artist.trim()
  const title = song.title.trim()
  return startImport(akapela, {
    id: randomUUID(),
    title,
    sourceKind: 'youtube',
    sourceRef: '',
    artist,
    durationMs: song.durationMs,
    song: { artist, title },
    playlistImport,
  })
}

/**
 * Writes a placeholder cover into the Track's directory, inserts the Track in
 * importing state, and enqueues the import job.
 */
function startImport(
  akapela: Akapela,
  input: {
    id: string
    title: string
    sourceKind: SourceKind
    sourceRef: string
    artist?: string
    durationMs?: number
    /** A Song confirmed as the Track is created, which only a Playlist Import does. */
    song?: { artist: string, title: string }
    playlistImport?: PlaylistImportLabel
  },
): TrackWithJob {
  const dir = trackDir(akapela, input.id)
  mkdirSync(dir, { recursive: true })
  const coverPath = `${COVER_BASENAME}.svg`
  writeFileSync(join(dir, coverPath), placeholderCoverSvg(input.title))

  const now = Date.now()
  const track: Track = {
    id: input.id,
    title: input.title,
    artist: input.artist ?? null,
    durationMs: input.durationMs ?? null,
    coverPath,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    importState: 'importing',
    separationState: 'none',
    backingSource: DEFAULT_BACKING_SOURCE,
    stemLevels: { ...DEFAULT_STEM_LEVELS },
    stemsModel: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    songArtist: input.song?.artist ?? null,
    songTitle: input.song?.title ?? null,
    songProviderIds: input.song ? {} : null,
    songAlbumArtUrl: null,
    // New Tracks start where the singer said Lyrics should come from.
    lyricsProvider: defaultLyricsProviderOf(akapela),
    lyricsOffsetMs: 0,
    titleEdited: false,
    artistEdited: false,
    coverEdited: false,
    createdAt: now,
    updatedAt: now,
  }
  akapela.db.insert(tracks).values(track).run()
  const job = enqueueJob(akapela, { type: 'import', targetId: input.id, playlistImport: input.playlistImport })
  return { ...track, job, separationJobId: null }
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

const latestSeparationJobId = sql<string | null>`(
  select j.id from jobs j
  where j.target_id = ${tracks.id} and j.type = 'separate'
  order by j.created_at desc, j.rowid desc
  limit 1
)`

function selectTracksWithJob(akapela: Akapela) {
  return akapela.db
    .select({ track: tracks, job: jobs, separationJobId: latestSeparationJobId })
    .from(tracks)
    .leftJoin(jobs, eq(jobs.id, latestImportJobId))
}

/**
 * A row straight off the `tracks` table carries whatever JSON was last
 * written, which for anything from before this pair of fields existed is a
 * phase-one three-field blob — `$type<Adjustments>()` only asserts the shape
 * at compile time. `parseAdjustments` is the same tolerant boundary the PUT
 * endpoint uses, defaulting the two Effects rather than throwing, so a
 * phase-one Track still loads (and plays as a straight wire) instead of
 * handing the engine `undefined` Effects and a non-finite AudioParam.
 */
function withParsedAdjustments(row: { track: Track, job: Job | null, separationJobId: string | null }): TrackWithJob {
  return {
    ...row.track,
    adjustments: parseAdjustments(row.track.adjustments),
    job: row.job,
    separationJobId: row.separationJobId,
  }
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
    .map(withParsedAdjustments)
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
  return row && withParsedAdjustments(row)
}

/** The Track with its Lyrics and Takes, which is what opening one is for. */
export function trackDetail(akapela: Akapela, track: TrackWithJob): TrackDetail {
  return {
    ...track,
    separationJob: latestSeparationJob(akapela, track.id),
    hasStems: hasStems(akapela, track),
    stemsModel: hasStems(akapela, track) ? (track.stemsModel ?? DEFAULT_SEPARATION_MODEL) : null,
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

/** The other Track a Song is already confirmed on, which is what refusing it names. */
export interface TrackWithSong {
  id: string
  title: string
}

/**
 * The Track this Song is confirmed on, if any. Two Songs are the same when
 * their artist and title are, exactly, once the whitespace around each is
 * trimmed: case, accents, a "feat." or a " - Remastered 2011" all make another
 * Song (CONTEXT.md). `exceptTrackId` leaves one Track out, so re-confirming a
 * Track's own Song is not a clash with itself.
 *
 * Libraries from before the rule may have two Tracks on one Song; this names
 * the oldest.
 */
export function trackWithSong(
  akapela: Akapela,
  song: Pick<Song, 'artist' | 'title'>,
  exceptTrackId?: string,
): TrackWithSong | undefined {
  const row = akapela.sqlite
    .prepare(
      `SELECT id, title FROM tracks
       WHERE coalesce(song_artist, '') = ? AND song_title = ? AND id != ?
       ORDER BY created_at, rowid LIMIT 1`,
    )
    .get(song.artist.trim(), song.title.trim(), exceptTrackId ?? '') as TrackWithSong | undefined
  return row
}

export const SONG_IN_LIBRARY_MESSAGE = 'Another Track already has this Song'

/** Refuses a Song another Track already has; nothing about either Track changes. */
export class SongInLibraryError extends CodedError<'songInLibrary'> {
  readonly other: TrackWithSong

  constructor(other: TrackWithSong) {
    super(failure('songInLibrary', { title: other.title }), `${SONG_IN_LIBRARY_MESSAGE}: ${other.title}`)
    this.other = other
  }
}

/**
 * Confirms the Song a Track represents. The Song's artist becomes the Track's
 * too, since confirming one is what gives a Track the artist the library
 * lists it by — unless the singer has typed an artist themselves.
 *
 * No two Tracks share a Song, so one another Track already has is refused
 * with `SongInLibraryError`. The check and the write are one transaction,
 * so two requests confirming the same Song at once cannot both succeed. It is
 * checked here rather than by a unique index, because a library from before
 * the rule may already hold duplicates, and those stay as they are.
 */
export function saveSong(akapela: Akapela, track: TrackWithJob, song: Song): TrackWithJob {
  const artist = song.artist.trim()
  const title = song.title.trim()
  const saved = {
    songArtist: artist,
    songTitle: title,
    songProviderIds: song.providerIds,
    songAlbumArtUrl: song.albumArtUrl,
    artist: track.artistEdited ? track.artist : artist,
    updatedAt: Date.now(),
  }
  akapela.db.transaction((tx) => {
    const other = otherTrackWithSong(akapela, track, { artist, title })
    if (other) throw new SongInLibraryError(other)
    tx.update(tracks).set(saved).where(eq(tracks.id, track.id)).run()
  }, { behavior: 'immediate' })
  return { ...track, ...saved }
}

/**
 * The other Track that confirming this Song on `track` would clash with. A
 * Track confirming the Song it already has clashes with nothing, even with a
 * duplicate from before the rule.
 */
export function otherTrackWithSong(
  akapela: Akapela,
  track: Track,
  song: Pick<Song, 'artist' | 'title'>,
): TrackWithSong | undefined {
  const current = confirmedSong(track)
  if (current && current.artist === song.artist.trim() && current.title === song.title.trim()) return undefined
  return trackWithSong(akapela, song, track.id)
}

/**
 * Renames a Track: the title and artist the library lists it by. The confirmed
 * Song is left alone. Whatever actually changed is marked as the singer's, so
 * nothing automatic writes over it later (see `titleEdited` in the schema).
 *
 * A Track still on its generated placeholder cover gets it redrawn, since the
 * placeholder shows the title's first letter.
 */
export function saveTrackDetails(akapela: Akapela, track: TrackWithJob, details: TrackDetails): TrackWithJob {
  const saved = {
    title: details.title,
    artist: details.artist,
    titleEdited: track.titleEdited || details.title !== track.title,
    artistEdited: track.artistEdited || details.artist !== track.artist,
    updatedAt: Date.now(),
  }
  akapela.db.update(tracks).set(saved).where(eq(tracks.id, track.id)).run()
  if (!track.coverEdited && track.coverPath === `${COVER_BASENAME}.svg`) {
    writeFileSync(join(trackDir(akapela, track.id), track.coverPath), placeholderCoverSvg(details.title))
  }
  return { ...track, ...saved }
}

/** Larger than any album cover, so a body this big is not one. */
export const MAX_COVER_BYTES = 8 * 1024 * 1024

/**
 * An import writes the Source's artwork into the same files, so a cover
 * uploaded mid-import could be overwritten on disk before the import sees it.
 */
export const COVER_WHILE_IMPORTING_MESSAGE = 'Cover art can be changed once the Track has finished importing'

export const COVER_TOO_LARGE_MESSAGE
  = `That image is too large for cover art (${MAX_COVER_BYTES / 1024 / 1024} MB at most)`

/**
 * Replaces a Track's cover art with an image the singer uploaded. The caller
 * has already checked it is one (`uploadedCoverExtension`). From then on the
 * cover is theirs, and album art from a Song confirmed later does not replace it.
 */
export function replaceCoverWithUpload(
  akapela: Akapela,
  track: TrackWithJob,
  bytes: Uint8Array,
  ext: string,
): TrackWithJob {
  return writeCover(akapela, track, bytes, ext, true)
}

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
  // A cover the singer picked outranks any provider's.
  if (track.coverEdited) return track
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
  // Asked again after the fetch: the singer may have uploaded a cover while it ran.
  if (getTrack(akapela, track.id)?.coverEdited) return track
  return writeCover(akapela, track, bytes, ext, false)
}

/** Puts new cover art in place of the Track's current cover, whatever type either is. */
function writeCover(
  akapela: Akapela,
  track: TrackWithJob,
  bytes: Uint8Array,
  ext: string,
  /** Whether the singer supplied this cover, which protects it from being replaced automatically. */
  coverEdited: boolean,
): TrackWithJob {
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

  const saved = { coverPath, coverEdited: coverEdited || track.coverEdited, updatedAt: Date.now() }
  akapela.db.update(tracks).set(saved).where(eq(tracks.id, track.id)).run()
  return { ...track, ...saved }
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

/**
 * Deletes the Track's rows, its jobs, and its directory. Returns false when no
 * such Track exists. `keepJobId` spares one Job row: a cancelled import deletes
 * its Track, but the Job the singer cancelled stays until they clear it.
 */
export function deleteTrack(akapela: Akapela, id: string, options: { keepJobId?: string } = {}): boolean {
  const deleted = akapela.db.transaction((tx) => {
    const removed = tx.delete(tracks).where(eq(tracks.id, id)).returning({ id: tracks.id }).all()
    if (removed.length === 0) return false
    const targeting = eq(jobs.targetId, id)
    tx.delete(jobs).where(options.keepJobId ? and(targeting, ne(jobs.id, options.keepJobId)) : targeting).run()
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
 * Absolute path of one of a Track's stored audio files: its original audio,
 * or one Stem (`../api/tracks/[id]/backing.get`). A Backing Source of `stems`
 * is two files, so it is asked for one Stem at a time.
 */
export function trackAudioPath(akapela: Akapela, track: Track, file: TrackAudioFile): string {
  const dir = trackDir(akapela, track.id)
  const basename = TRACK_AUDIO_BASENAMES[file]
  // A file that is not there yet is named as a WAV, which is what the 404
  // for it says.
  return findAudioFile(dir, basename) ?? join(dir, audioFileName(basename, 'wav'))
}

/**
 * Whether this Track has Stems to sing over. The Instrumental Stem stands for
 * both, since a separation writes them together. The file itself is
 * the answer, because `separation_state` cannot be: a Track that was separated,
 * switched back to its original audio, and is now being separated again reads
 * exactly like one being separated for the first time, and yet the Stems of the
 * earlier run are still there and still playable — the worker keeps them until
 * a new run has produced replacements.
 */
export function hasStems(akapela: Akapela, track: Track): boolean {
  return findAudioFile(trackDir(akapela, track.id), INSTRUMENTAL_BASENAME) !== null
}

/** Absolute paths of both Stem files a separation writes, in every Audio Format, whether or not they exist. */
function stemPaths(akapela: Akapela, track: Track): string[] {
  const dir = trackDir(akapela, track.id)
  return [...audioFileCandidates(dir, INSTRUMENTAL_BASENAME), ...audioFileCandidates(dir, VOCALS_BASENAME)]
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
 * and the two files move. A Mix that named the Stems still remembers having
 * done so; re-rendering it is what has to notice the Stems are gone, not
 * this. The remembered Stem Levels stay, for when Stems come back.
 */
export function deleteStems(akapela: Akapela, track: TrackWithJob): TrackWithJob {
  for (const path of stemPaths(akapela, track)) rmSync(path, { force: true })
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ backingSource: DEFAULT_BACKING_SOURCE, separationState: 'none', stemsModel: null, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, backingSource: DEFAULT_BACKING_SOURCE, separationState: 'none', stemsModel: null, updatedAt: now }
}

/**
 * Remembers what a Track's Backing Track is taken from, and at which Stem
 * Levels, so opening it again gives back whatever was last sung over. The
 * caller has already established that the named source exists — only
 * `original` always does, since a separation never overwrites it. Levels are
 * kept whatever the source, so ones set while on Original are there when the
 * singer switches to Stems.
 */
export function saveBackingSource(
  akapela: Akapela,
  track: TrackWithJob,
  backingSource: BackingSource,
  stemLevels: StemLevels = track.stemLevels,
): TrackWithJob {
  if (track.backingSource === backingSource && sameStemLevels(track.stemLevels, stemLevels)) return track
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ backingSource, stemLevels, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...track, backingSource, stemLevels, updatedAt: now }
}

/**
 * Remembers a Track's Stem Levels and nothing else. A slider saves through
 * this rather than `saveBackingSource`, so a switch or a Separation that lands
 * while the save is in flight is never written back over.
 */
export function saveStemLevels(akapela: Akapela, track: TrackWithJob, stemLevels: StemLevels): TrackWithJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ stemLevels, updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  return { ...(getTrack(akapela, track.id) ?? track), stemLevels, updatedAt: now }
}

/** A Track whose import searches YouTube for its song, and so has no link of its own until it has found one. */
export function needsYoutubeLink(track: Track): boolean {
  return track.sourceKind === 'youtube' && !track.sourceRef
}

export const YOUTUBE_LINK_NEEDED_MESSAGE = 'Paste a YouTube link to import this Track from'

/**
 * Retries a failed import from a link the singer pasted: what a Playlist
 * Import's Track that found nothing on YouTube is retried with. The link
 * becomes the Track's Source, and the import starts from the download.
 */
export function retryImportFromLink(akapela: Akapela, track: TrackWithJob, url: string): TrackWithJob {
  const videoId = youtubeVideoId(url)
  if (!videoId) throw new CodedError(failure('invalidYoutubeUrl'), INVALID_YOUTUBE_URL_MESSAGE)
  const sourceRef = canonicalYoutubeUrl(videoId)
  akapela.db.update(tracks).set({ sourceRef }).where(eq(tracks.id, track.id)).run()
  return retryImport(akapela, { ...track, sourceRef })
}

/**
 * Puts a failed Track back into importing state and enqueues a fresh import
 * job. One a Playlist Import started stays part of it, and so stays on its
 * Lane and in its group on the Jobs page.
 */
export function retryImport(akapela: Akapela, track: TrackWithJob): TrackWithJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ importState: 'importing', updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  const job = enqueueJob(akapela, {
    type: 'import',
    targetId: track.id,
    playlistImport: track.job ? playlistImportOf(track.job) : null,
  })
  return { ...track, importState: 'importing', updatedAt: now, job }
}

/** The most recent separate Job on a Track, which is the one whose progress and error the page shows. */
export function latestSeparationJob(akapela: Akapela, trackId: string): Job | null {
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
 *
 * The Separation Model is fixed here, when the Separation is asked for — the
 * default unless one was named — and never read again from Settings. A
 * Separation a Playlist Import asked for carries its label.
 */
export function startSeparation(
  akapela: Akapela,
  track: TrackWithJob,
  separationModel: SeparationModelName = defaultSeparationModelOf(akapela),
  playlistImport: PlaylistImportLabel | null = null,
): TrackWithSeparationJob {
  const now = Date.now()
  akapela.db
    .update(tracks)
    .set({ separationState: 'separating', updatedAt: now })
    .where(eq(tracks.id, track.id))
    .run()
  const separationJob = enqueueJob(akapela, { type: 'separate', targetId: track.id, separationModel, playlistImport })
  return { ...track, separationState: 'separating', updatedAt: now, separationJob, separationJobId: separationJob.id }
}
