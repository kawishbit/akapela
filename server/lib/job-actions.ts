import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { mixes, type Job, type JobType } from '../db/schema'
import { enqueueJob, getJob, laneOf, type Lane } from './jobs'
import { retryMix } from './mixes'
import {
  deleteTrack,
  getTrack,
  retryImport,
  startSeparation,
  trackDir,
} from './tracks'
import type { Akapela } from './akapela'
import { findAudioFile, INSTRUMENTAL_BASENAME } from './audio-files'
import { DEFAULT_SEPARATION_MODEL } from './separators/models'
import { CodedError, failure } from '../../shared/error-codes'

/**
 * What the singer can do to a Job from the Jobs page — cancel it, retry it,
 * clear the finished ones away — and the list that page renders. The runner
 * owns every state change a Job makes on its own; this owns the ones the
 * singer asks for, and the domain work each implies: a Job is only ever
 * cancelled together with putting its target back the way it was.
 */

/** A request the Job's current state cannot honour; the route answers it with a 409. */
type JobRefusal = 'jobFinished' | 'notRetryable' | 'jobTargetGone'

export class JobActionRefused extends CodedError<JobRefusal> {
  constructor(code: JobRefusal, message: string) {
    super(failure(code), message)
  }
}

/**
 * A newer Job of the same type on the same target, as SQL over an outer
 * `jobs` row aliased `j`. "Newer" is creation order, which is also run order.
 */
const NEWER_SIBLING = `EXISTS (
  SELECT 1 FROM jobs n
  WHERE n.type = j.type AND n.target_id = j.target_id
    AND (n.created_at > j.created_at OR (n.created_at = j.created_at AND n.rowid > j.rowid))
)`

/** Whether the Job's target is gone, as SQL over an outer `jobs` row aliased `j`. A target-less Job never is. */
const TARGET_GONE = `(j.target_id IS NOT NULL AND CASE j.type
  WHEN 'render' THEN NOT EXISTS (SELECT 1 FROM mixes m WHERE m.id = j.target_id)
  WHEN 'noop' THEN 0
  ELSE NOT EXISTS (SELECT 1 FROM tracks t WHERE t.id = j.target_id)
END)`

/** One row of the Jobs page: the Job, its Lane, and enough of its target to name it. */
export interface JobListEntry extends Job {
  lane: Lane
  /** The Track the Job works on — for a Mix, the Track its Take was sung on. Null once that is gone. */
  track: { id: string, title: string, artist: string | null, updatedAt: number } | null
  /** For a Mix, the Take behind it: which one of its Track's Takes, counted from the first, and when it was sung. */
  take: { id: string, number: number, createdAt: number } | null
}

interface JobListRow {
  id: string
  type: string
  target_id: string | null
  state: string
  progress: number
  error: string | null
  error_code: string | null
  error_params: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  trace_parent: string | null
  separation_model: string | null
  detail: string | null
  track_id: string | null
  track_title: string | null
  track_artist: string | null
  track_updated_at: number | null
  take_id: string | null
  take_created_at: number | null
  take_number: number | null
}

/**
 * Every Job worth a row on the Jobs page, in creation order: only the latest
 * of each type on each target, so a retried failure drops out of the list
 * instead of sitting next to its replacement. One query, so the page never
 * asks again per row.
 */
export function listJobs(akapela: Akapela): JobListEntry[] {
  const rows = akapela.sqlite
    .prepare(
      `SELECT j.id, j.type, j.target_id, j.state, j.progress, j.error, j.error_code, j.error_params, j.created_at,
         j.started_at, j.finished_at, j.trace_parent, j.separation_model, j.detail,
         tr.id AS track_id, tr.title AS track_title, tr.artist AS track_artist, tr.updated_at AS track_updated_at,
         tk.id AS take_id, tk.created_at AS take_created_at,
         (SELECT count(*) FROM takes t2 WHERE t2.track_id = tk.track_id
            AND (t2.created_at < tk.created_at OR (t2.created_at = tk.created_at AND t2.rowid <= tk.rowid))
         ) AS take_number
       FROM jobs j
       LEFT JOIN mixes m ON j.type = 'render' AND m.id = j.target_id
       LEFT JOIN takes tk ON tk.id = m.take_id
       LEFT JOIN tracks tr ON tr.id = CASE WHEN j.type = 'render' THEN tk.track_id ELSE j.target_id END
       WHERE NOT ${NEWER_SIBLING}
       ORDER BY j.created_at, j.rowid`,
    )
    .all() as JobListRow[]
  return rows.map(row => ({
    id: row.id,
    type: row.type as JobType,
    targetId: row.target_id,
    state: row.state as Job['state'],
    progress: row.progress,
    error: row.error,
    errorCode: row.error_code,
    errorParams: row.error_params === null ? null : JSON.parse(row.error_params),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    traceParent: row.trace_parent,
    separationModel: row.separation_model as Job['separationModel'],
    detail: row.detail,
    lane: laneOf(row.type as JobType),
    track: row.track_id === null
      ? null
      : { id: row.track_id, title: row.track_title!, artist: row.track_artist, updatedAt: row.track_updated_at! },
    take: row.take_id === null
      ? null
      : { id: row.take_id, number: row.take_number!, createdAt: row.take_created_at! },
  }))
}

/**
 * Cancels a queued or running Job and puts its target back the way it was
 * before the Job was asked for. The Job row stays, `cancelled`, until the
 * singer clears it.
 *
 * A running Job is marked first and aborted in the same tick, so a handler
 * that checks its signal before committing anything always sees it; the
 * cleanup waits until the handler has let go, so it never races one still
 * writing into the Track.
 */
export async function cancelJob(akapela: Akapela, job: Job): Promise<Job> {
  const cancelled = akapela.sqlite
    .prepare(`UPDATE jobs SET state = 'cancelled', error = NULL, finished_at = ? WHERE id = ? AND state IN ('queued', 'running')`)
    .run(Date.now(), job.id)
  if (cancelled.changes === 0) {
    throw new JobActionRefused('jobFinished', 'This Job has already finished')
  }
  await akapela.runningJobs.abort(job.id)
  undoJob(akapela, job)
  return getJob(akapela, job.id)!
}

/**
 * Puts a cancelled Job's target back the way it was before the Job was asked
 * for, so a Track the singer changed their mind about looks untouched.
 */
function undoJob(akapela: Akapela, job: Job): void {
  const targetId = job.targetId
  if (!targetId) return
  switch (job.type) {
    case 'separate': {
      // No `cancelled` Separation state: back to having Stems if the Track
      // was being re-separated, and to never having been asked if not.
      const hasStems = findAudioFile(trackDir(akapela, targetId), INSTRUMENTAL_BASENAME) !== null
      akapela.sqlite
        .prepare(`UPDATE tracks SET separation_state = ?, updated_at = ? WHERE id = ?`)
        .run(hasStems ? 'ready' : 'none', Date.now(), targetId)
      return
    }
    case 'import':
      // A half-imported Track nobody wanted is clutter; pasting the link again is trivial.
      deleteTrack(akapela, targetId, { keepJobId: job.id })
      return
    case 'render': {
      const mix = akapela.sqlite
        .prepare(
          `DELETE FROM mixes WHERE id = ?
           RETURNING mp3_path, wav_path, (SELECT track_id FROM takes WHERE takes.id = mixes.take_id) AS track_id`,
        )
        .get(targetId) as { mp3_path: string | null, wav_path: string | null, track_id: string } | undefined
      if (!mix) return
      const dir = trackDir(akapela, mix.track_id)
      if (mix.mp3_path) rmSync(join(dir, mix.mp3_path), { force: true })
      if (mix.wav_path) rmSync(join(dir, mix.wav_path), { force: true })
      return
    }
    case 'noop':
      return
  }
}

/**
 * Asks again for what a failed Job was doing, through the same domain
 * functions the Track and Take pages use. Always a new Job row; the failed one
 * keeps its error, and drops off the Jobs page because it is no longer the
 * latest on its target.
 */
export function retryJob(akapela: Akapela, job: Job): Job {
  if (job.state !== 'failed') throw new JobActionRefused('notRetryable', 'Only a failed Job can be retried')
  if (hasNewerSibling(akapela, job)) throw new JobActionRefused('notRetryable', 'This Job has already been retried')

  const gone = () => new JobActionRefused('jobTargetGone', 'What this Job was working on no longer exists')
  switch (job.type) {
    case 'import': {
      const track = job.targetId ? getTrack(akapela, job.targetId) : undefined
      if (!track) throw gone()
      return retryImport(akapela, track).job!
    }
    case 'separate': {
      const track = job.targetId ? getTrack(akapela, job.targetId) : undefined
      if (!track) throw gone()
      // Asked again with what it was asked for, not whatever the default is now.
      return startSeparation(akapela, track, job.separationModel ?? DEFAULT_SEPARATION_MODEL).separationJob
    }
    case 'render': {
      const mix = job.targetId
        ? akapela.db.select().from(mixes).where(eq(mixes.id, job.targetId)).get()
        : undefined
      if (!mix) throw gone()
      return retryMix(akapela, mix).job!
    }
    case 'noop':
      return enqueueJob(akapela, { type: 'noop', targetId: job.targetId })
  }
}

function hasNewerSibling(akapela: Akapela, job: Job): boolean {
  if (!job.targetId) return false
  return akapela.sqlite
    .prepare(`SELECT ${NEWER_SIBLING} AS newer FROM jobs j WHERE j.id = ?`)
    .pluck()
    .get(job.id) === 1
}

/**
 * Clears finished Jobs off the Jobs page: every succeeded and cancelled one,
 * and every failure that has been retried or whose target is gone. A failure
 * that is still the latest word on its Track or Mix stays, because its row
 * carries the error message that Track's page shows. Returns how many went.
 */
export function clearFinishedJobs(akapela: Akapela): number {
  return akapela.sqlite
    .prepare(
      `DELETE FROM jobs AS j WHERE j.state IN ('succeeded', 'cancelled')
         OR (j.state = 'failed' AND (${NEWER_SIBLING} OR ${TARGET_GONE}))`,
    )
    .run()
    .changes
}
