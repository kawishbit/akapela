import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { desc, eq, sql } from 'drizzle-orm'
import { jobs, tracks, type Job, type Track } from '../db/schema'
import { UNSUPPORTED_UPLOAD_MESSAGE, uploadExtension } from '../../shared/upload'
import { placeholderCoverSvg } from './cover'
import { enqueueJob } from './jobs'
import type { Presto } from './presto'

/** Filename of the normalized 44.1 kHz stereo WAV the worker writes into the Track directory (ADR 0005). */
export const BACKING_TRACK_FILE = 'backing.wav'

/** A Track together with its most recent Job, which carries import progress and error. */
export type TrackWithJob = Track & { job: Job | null }

/** Absolute path of the directory owning every file of one Track. */
export function trackDir(presto: Presto, trackId: string): string {
  return join(presto.dataDir, 'tracks', trackId)
}

/**
 * Creates a Track from an uploaded file: writes the original as delivered and a
 * placeholder cover under the Track's directory, then enqueues the import job
 * the worker turns into a Backing Track.
 */
export function createTrackFromUpload(
  presto: Presto,
  input: { filename: string, bytes: Uint8Array },
): TrackWithJob {
  const ext = uploadExtension(input.filename)
  if (!ext) throw new Error(UNSUPPORTED_UPLOAD_MESSAGE)

  const id = randomUUID()
  const title = input.filename.slice(0, -(ext.length + 1)).trim() || input.filename
  const dir = trackDir(presto, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `original.${ext}`), input.bytes)
  const coverPath = 'cover.svg'
  writeFileSync(join(dir, coverPath), placeholderCoverSvg(title))

  const now = Date.now()
  const track: Track = {
    id,
    title,
    artist: null,
    durationMs: null,
    coverPath,
    sourceKind: 'upload',
    sourceRef: input.filename,
    importState: 'importing',
    createdAt: now,
    updatedAt: now,
  }
  presto.db.insert(tracks).values(track).run()
  const job = enqueueJob(presto, { type: 'import', targetId: id })
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
