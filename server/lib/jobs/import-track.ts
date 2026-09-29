import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { audioDurationMs, normalizeToBackingTrack } from '../audio'
import { audioFileName, BACKING_BASENAME, replaceAudioFile } from '../audio-files'
import { ORIGINAL_BASENAME, type ProgressCallback, type SourceFetcher } from '../sources'
import type { Handler, JobContext } from '../jobs-runner'
import { audioFormatNow, ensureNotDeleted, trackDir } from './track-paths'
import { chooseYoutubeMatch, MATCH_TOLERANCE_MS, youtubeSearchQuery } from '../youtube-match'
import { CodedError, failure } from '../../../shared/error-codes'

/**
 * The import job: turn a Track's Source into its Backing Track. Ported from
 * `worker/akapela_worker/jobs/import_track.py` (ticket 03).
 *
 * The app creates the Track in `importing` and enqueues this job with the
 * Track id as target. For an Upload Source the original is already under the
 * Track directory as delivered. For a YouTube Source, metadata is fetched and
 * written to the Track first, so the card shows the title and thumbnail while
 * the audio is still downloading, then the audio is downloaded. Either way the
 * original is normalized to the 44.1 kHz stereo Backing Track, in the Audio
 * Format in force when it is written (ADR 0016), the
 * duration recorded, and the Track marked `ready`. Any failure marks the
 * Track `failed` and re-throws so the runner records the message on the job
 * row. Nothing retries on its own.
 *
 * A Playlist Import's Track starts with no link: the job searches YouTube for
 * its confirmed Song first (`noYoutubeMatch` when nothing is close enough),
 * and once the Track is ready, fetches its Lyrics and queues its Separation
 * through the follow-up it was given.
 */

// Progress milestones. The YouTube download fills the gap between the first two.
const PROGRESS_SOURCE_KNOWN = 10
const PROGRESS_AUDIO_ON_DISK = 50
const PROGRESS_NORMALIZED = 80

/** The original Source audio, kept as delivered with whatever extension it came with. */
async function findOriginal(directory: string): Promise<string> {
  const entries = await readdir(directory).catch(() => [] as string[])
  const candidates = entries.filter(name => name.startsWith(`${ORIGINAL_BASENAME}.`)).sort()
  if (candidates.length === 0) throw new Error(`no original audio in ${directory}`)
  return join(directory, candidates[0]!)
}

/**
 * What a Playlist Import's Track gets once its Backing Track is in place:
 * its Lyrics, then its Separation. Run by the import Job, since this is the
 * one import where the singer has asked for everything; it needs the whole
 * app (`../playlist-imports.ts`), which a handler is not given, so it is
 * passed in. `spotifyDurationMs` is the song's length as Spotify listed it.
 */
export type PlaylistImportFollowUp = (ctx: JobContext, trackId: string, spotifyDurationMs: number | null) => Promise<void>

export interface ImportHandlerOptions {
  /** Left out, a Playlist Import's Track is imported and nothing more — what a test of the import alone wants. */
  followUp?: PlaylistImportFollowUp
}

interface TrackRow {
  id: string
  source_kind: string
  source_ref: string
  duration_ms: number | null
  song_artist: string | null
  song_title: string | null
}

export function importHandler(fetcher: SourceFetcher, options: ImportHandlerOptions = {}): Handler {
  return async (ctx) => {
    const trackId = ctx.job.targetId
    if (!trackId) throw new Error('import job has no target Track')
    const row = ctx.sqlite
      .prepare(`SELECT id, source_kind, source_ref, duration_ms, song_artist, song_title FROM tracks WHERE id = ?`)
      .get(trackId) as TrackRow | undefined
    if (!row) throw new Error(`Track ${trackId} does not exist`)
    const fromPlaylistImport = Boolean(ctx.job.playlistImportId)

    const directory = trackDir(ctx.dataDir, trackId)
    try {
      let original: string
      if (row.source_kind === 'youtube') {
        // A Playlist Import's Track starts with no link: its song is found on YouTube first.
        const url = row.source_ref || await matchOnYoutube(ctx, fetcher, row, directory)
        // Its title is Spotify's, which is the song's own name rather than a video's.
        original = await fetchFromSource(ctx, fetcher, trackId, url, directory, { keepTitle: fromPlaylistImport })
      }
      else if (row.source_kind === 'upload') {
        original = await findOriginal(directory)
        ctx.progress(PROGRESS_SOURCE_KNOWN)
      }
      else {
        throw new Error(`Source kind '${row.source_kind}' is not importable`)
      }

      // In the Audio Format in force now, replacing whatever a retried import
      // left behind in another one.
      const backing = join(directory, audioFileName(BACKING_BASENAME, audioFormatNow(ctx.sqlite)))
      await normalizeToBackingTrack(original, backing, ctx.signal)
      await replaceAudioFile(directory, BACKING_BASENAME, backing)
      ctx.signal.throwIfAborted()
      ctx.progress(PROGRESS_NORMALIZED)

      const durationMs = await audioDurationMs(backing)
      await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
      ctx.sqlite
        .prepare(`UPDATE tracks SET duration_ms = ?, import_state = 'ready', updated_at = ? WHERE id = ?`)
        .run(durationMs, Date.now(), trackId)
    }
    catch (error) {
      // Cancelled: the cancel deletes the Track and its directory once this
      // returns, and the child process is already gone.
      if (ctx.signal.aborted) throw error
      // If the Track was deleted mid-run, that is the failure that surfaces —
      // there is no Track left to mark failed, so this replaces the original
      // error rather than following it.
      await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
      ctx.sqlite
        .prepare(`UPDATE tracks SET import_state = 'failed', updated_at = ? WHERE id = ?`)
        .run(Date.now(), trackId)
      throw error
    }

    // The Track is ready whatever happens next: Lyrics that cannot be found,
    // or a Separation that cannot be queued, leave it ready to sing over its
    // original audio, the way a lookup that finds nothing does today.
    if (fromPlaylistImport && options.followUp && !ctx.signal.aborted) {
      try {
        await options.followUp(ctx, trackId, row.duration_ms)
      }
      catch (error) {
        if (ctx.signal.aborted) return
        console.warn(`the follow-up to importing Track ${trackId} failed:`, error)
      }
    }
  }
}

/**
 * Finds the Track's confirmed Song on YouTube and stores the link as its
 * Source, so a retry downloads it rather than searching again. Nothing close
 * enough in length is `noYoutubeMatch`, which the singer answers with a link
 * of their own.
 */
async function matchOnYoutube(ctx: JobContext, fetcher: SourceFetcher, row: TrackRow, directory: string): Promise<string> {
  const artist = row.song_artist ?? ''
  const title = row.song_title ?? ''
  const results = await fetcher.searchYoutube(youtubeSearchQuery(artist, title), ctx.signal)
  ctx.signal.throwIfAborted()
  const match = chooseYoutubeMatch(results, row.duration_ms)
  if (!match) {
    throw new CodedError(
      failure('noYoutubeMatch', { artist, title }),
      `No YouTube result for "${youtubeSearchQuery(artist, title)}" within ${MATCH_TOLERANCE_MS / 1000} s of ${row.duration_ms} ms`,
    )
  }
  await ensureNotDeleted(ctx.sqlite, row.id, directory, 'import')
  ctx.sqlite
    .prepare(`UPDATE tracks SET source_ref = ?, updated_at = ? WHERE id = ?`)
    .run(match.url, Date.now(), row.id)
  return match.url
}

/**
 * Metadata onto the Track first, then the audio, with download progress on
 * the job. `keepTitle` leaves the title alone, which is what a Playlist
 * Import's Track wants: Spotify's title names the song, a video's does not.
 */
async function fetchFromSource(
  ctx: JobContext,
  fetcher: SourceFetcher,
  trackId: string,
  url: string,
  directory: string,
  options: { keepTitle?: boolean } = {},
): Promise<string> {
  const edited = ctx.sqlite.prepare(`SELECT cover_edited FROM tracks WHERE id = ?`).get(trackId) as
    { cover_edited: number } | undefined
  const metadata = await fetcher.fetchMetadata(url, directory, { keepCover: Boolean(edited?.cover_edited), signal: ctx.signal })
  ctx.signal.throwIfAborted()
  await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
  // A title or cover the singer set survives a retried import.
  ctx.sqlite
    .prepare(
      `UPDATE tracks SET
         title = CASE WHEN title_edited OR ? THEN title ELSE ? END,
         duration_ms = ?,
         cover_path = CASE WHEN cover_edited THEN cover_path ELSE coalesce(?, cover_path) END,
         updated_at = ?
       WHERE id = ?`,
    )
    .run(options.keepTitle ? 1 : 0, metadata.title, metadata.durationMs, metadata.coverFile, Date.now(), trackId)
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

  const original = await fetcher.downloadAudio(url, directory, onProgress, ctx.signal)
  ctx.signal.throwIfAborted()
  await ensureNotDeleted(ctx.sqlite, trackId, directory, 'import')
  ctx.progress(PROGRESS_AUDIO_ON_DISK)
  return original
}
