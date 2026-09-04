import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, sql } from 'drizzle-orm'
import { jobs, mixes, takes, type Job, type Mix, type Take } from '../db/schema'
import type { MixRequest } from '../../shared/mix'
import { enqueueJob } from './jobs'
import type { Presto } from './presto'
import { trackDir } from './tracks'

/** A Mix together with the render Job that produces its files. */
export type MixWithJob = Mix & { job: Job | null }

function selectMixesWithJob(presto: Presto) {
  return presto.db
    .select({ mix: mixes, job: jobs })
    .from(mixes)
    .leftJoin(jobs, eq(jobs.id, mixes.jobId))
}

/** Every Mix of one Take, newest first. */
export function listMixesForTake(presto: Presto, takeId: string): MixWithJob[] {
  return selectMixesWithJob(presto)
    .where(eq(mixes.takeId, takeId))
    .orderBy(desc(mixes.createdAt), desc(sql`${mixes}.rowid`))
    .all()
    .map(row => ({ ...row.mix, job: row.job }))
}

/** Every Mix belonging to any Take of one Track, newest first — what the Track page lists under each Take. */
export function listMixesForTrack(presto: Presto, trackId: string): MixWithJob[] {
  return selectMixesWithJob(presto)
    .innerJoin(takes, eq(takes.id, mixes.takeId))
    .where(eq(takes.trackId, trackId))
    .orderBy(desc(mixes.createdAt), desc(sql`${mixes}.rowid`))
    .all()
    .map(row => ({ ...row.mix, job: row.job }))
}

/**
 * Requests a Mix: inserts its row with every render parameter fixed (tempo
 * copied from the Take, never from the request — ADR 0003) and enqueues the
 * worker's render job. The files do not exist yet; `mp3Path` and `wavPath`
 * stay null until the job succeeds.
 */
export function createMix(presto: Presto, take: Take, input: MixRequest): MixWithJob {
  const id = randomUUID()
  const job = enqueueJob(presto, { type: 'render', targetId: id })
  const now = Date.now()
  const mix: Mix = {
    id,
    takeId: take.id,
    mp3Path: null,
    wavPath: null,
    wavRequested: input.wav,
    pitchSemitones: input.adjustments.pitchSemitones,
    // Locked to the Take it was sung to, whatever the request said (ADR 0003).
    tempoPercent: take.adjustments.tempoPercent,
    linked: input.adjustments.linked,
    latencyNudgeMs: input.latencyNudgeMs,
    vocalGain: input.vocalGain,
    backingGain: input.backingGain,
    jobId: job.id,
    createdAt: now,
    updatedAt: now,
  }
  presto.db.insert(mixes).values(mix).run()
  return { ...mix, job }
}

/**
 * Re-enqueues the render job for a Mix whose previous one failed, reusing the
 * same row rather than requesting a fresh Mix — the same shape as
 * `retryImport` in `server/lib/tracks.ts`, so a retry doesn't leave a dead
 * failed entry cluttering the list next to a working one.
 */
export function retryMix(presto: Presto, mix: Mix): MixWithJob {
  const job = enqueueJob(presto, { type: 'render', targetId: mix.id })
  const now = Date.now()
  presto.db.update(mixes).set({ jobId: job.id, updatedAt: now }).where(eq(mixes.id, mix.id)).run()
  return { ...mix, jobId: job.id, updatedAt: now, job }
}

/** One Mix of a Take by id, or undefined when there is none — including a Mix id from another Take. */
export function getMix(presto: Presto, takeId: string, mixId: string): Mix | undefined {
  return presto.db
    .select()
    .from(mixes)
    .where(and(eq(mixes.takeId, takeId), eq(mixes.id, mixId)))
    .get()
}

/** Deletes a Mix's row and its files. Returns false when no such Mix exists on that Take. */
export function deleteMix(presto: Presto, trackId: string, takeId: string, mixId: string): boolean {
  const removed = presto.db
    .delete(mixes)
    .where(and(eq(mixes.takeId, takeId), eq(mixes.id, mixId)))
    .returning({ mp3Path: mixes.mp3Path, wavPath: mixes.wavPath })
    .all()
  if (removed.length === 0) return false
  const dir = trackDir(presto, trackId)
  const { mp3Path, wavPath } = removed[0]!
  if (mp3Path) rmSync(join(dir, mp3Path), { force: true })
  if (wavPath) rmSync(join(dir, wavPath), { force: true })
  return true
}
