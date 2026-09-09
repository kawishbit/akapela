import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { normalizeToBackingTrack, probeDurationMs } from '../audio'
import { ORIGINAL_BASENAME, type ProgressCallback, type SourceFetcher } from '../sources'
import type { Handler, JobContext } from '../jobs-runner'

/**
 * The import job: turn a Track's Source into its Backing Track. Ported from
 * `worker/akapela_worker/jobs/import_track.py` (ticket 03).
 *
 * The app creates the Track in `importing` and enqueues this job with the
 * Track id as target. For an Upload Source the original is already under the
 * Track directory as delivered. For a YouTube Source, metadata is fetched and
 * written to the Track first, so the card shows the title and thumbnail while
 * the audio is still downloading, then the audio is downloaded. Either way the
 * original is normalized to the 44.1 kHz stereo WAV Backing Track, the
 * duration recorded, and the Track marked `ready`. Any failure marks the
 * Track `failed` and re-throws so the runner records the message on the job
 * row. Nothing retries on its own.
 */

export const BACKING_TRACK_FILE = 'backing.wav'

// Progress milestones. The YouTube download fills the gap between the first two.
const PROGRESS_SOURCE_KNOWN = 10
const PROGRESS_AUDIO_ON_DISK = 50
const PROGRESS_NORMALIZED = 80

export function trackDir(dataDir: string, trackId: string): string {
  return join(dataDir, 'tracks', trackId)
}

/** The original Source audio, kept as delivered with whatever extension it came with. */
async function findOriginal(directory: string): Promise<string> {
  const entries = await readdir(directory).catch(() => [] as string[])
  const candidates = entries.filter(name => name.startsWith(`${ORIGINAL_BASENAME}.`)).sort()
  if (candidates.length === 0) throw new Error(`no original audio in ${directory}`)
  return join(directory, candidates[0]!)
}

function trackExists(sqlite: Database.Database, trackId: string): boolean {
  return sqlite.prepare(`SELECT 1 FROM tracks WHERE id = ?`).get(trackId) !== undefined
}

/**
 * The singer may delete a Track while a job that writes into it runs. The app
 * removes the rows and the directory; anything written afterwards is an
 * orphan, so remove it and give up rather than resurrect the Track.
 */
async function ensureNotDeleted(
  sqlite: Database.Database,
  trackId: string,
  directory: string,
  during: string,
): Promise<void> {
  if (trackExists(sqlite, trackId)) return
  await rm(directory, { recursive: true, force: true })
  throw new Error(`Track ${trackId} was deleted during ${during}`)
}

export function importHandler(fetcher: SourceFetcher): Handler {
  return async (ctx) => {
    const trackId = ctx.job.targetId
    if (!trackId) throw new Error('import job has no target Track')
    const row = ctx.sqlite
      .prepare(`SELECT id, source_kind, source_ref FROM tracks WHERE id = ?`)
      .get(trackId) as { id: string, source_kind: string, source_ref: string } | undefined
    if (!row) throw new Error(`Track ${trackId} does not exist`)

    const directory = trackDir(ctx.dataDir, trackId)
    try {
      let original: string
      if (row.source_kind === 'youtube') {
        original = await fetchFromSource(ctx, fetcher, trackId, row.source_ref, directory)
      }
      else if (row.source_kind === 'upload') {
        original = await findOriginal(directory)
        ctx.progress(PROGRESS_SOURCE_KNOWN)
      }
      else {
        throw new Error(`Source kind '${row.source_kind}' is not importable`)
      }

      const backing = join(directory, BACKING_TRACK_FILE)
      await normalizeToBackingTrack(original, backing)
      ctx.progress(PROGRESS_NORMALIZED)

      const durationMs = await probeDurationMs(backing)
      await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
      ctx.sqlite
        .prepare(`UPDATE tracks SET duration_ms = ?, import_state = 'ready', updated_at = ? WHERE id = ?`)
        .run(durationMs, Date.now(), trackId)
    }
    catch (error) {
      // If the Track was deleted mid-run, that is the failure that surfaces —
      // there is no Track left to mark failed, so this replaces the original
      // error rather than following it.
      await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
      ctx.sqlite
        .prepare(`UPDATE tracks SET import_state = 'failed', updated_at = ? WHERE id = ?`)
        .run(Date.now(), trackId)
      throw error
    }
  }
}

/** Metadata onto the Track first, then the audio, with download progress on the job. */
async function fetchFromSource(
  ctx: JobContext,
  fetcher: SourceFetcher,
  trackId: string,
  url: string,
  directory: string,
): Promise<string> {
  const metadata = await fetcher.fetchMetadata(url, directory)
  await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
  ctx.sqlite
    .prepare(
      `UPDATE tracks SET title = ?, duration_ms = ?, cover_path = coalesce(?, cover_path), updated_at = ? WHERE id = ?`,
    )
    .run(metadata.title, metadata.durationMs, metadata.coverFile, Date.now(), trackId)
  ctx.progress(PROGRESS_SOURCE_KNOWN)

  let lastReported = PROGRESS_SOURCE_KNOWN
  const onProgress: ProgressCallback = (fraction) => {
    const span = PROGRESS_AUDIO_ON_DISK - PROGRESS_SOURCE_KNOWN
    const percent = PROGRESS_SOURCE_KNOWN + Math.floor(span * Math.max(0, Math.min(1, fraction)))
    // yt-dlp reports many times a second; only touch the row when the number moves.
    if (percent !== lastReported) {
      lastReported = percent
      ctx.progress(percent)
    }
  }

  const original = await fetcher.downloadAudio(url, directory, onProgress)
  await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
  ctx.progress(PROGRESS_AUDIO_ON_DISK)
  return original
}
