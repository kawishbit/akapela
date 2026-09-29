import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { JOB_TYPES, jobs, type Job, type JobType } from '../db/schema'
import { currentTraceParent } from './request-trace'
import type { SeparationModelName } from './separators/models'
import type { Akapela } from './akapela'

/**
 * One of the two lines Jobs wait in, side by side (ADR 0012): `heavy` runs
 * Separations, `light` runs everything else. Derived from the Job's type and
 * never stored, so a type added later lands in the light Lane without anyone
 * deciding it should.
 */
export type Lane = 'heavy' | 'light'

export const HEAVY_JOB_TYPE: JobType = 'separate'

export function laneOf(type: JobType): Lane {
  return type === HEAVY_JOB_TYPE ? 'heavy' : 'light'
}

export function isJobType(value: unknown): value is JobType {
  return typeof value === 'string' && (JOB_TYPES as readonly string[]).includes(value)
}

export function enqueueJob(
  akapela: Akapela,
  input: { type: JobType, targetId?: string | null, separationModel?: SeparationModelName | null },
): Job {
  const job: Job = {
    id: randomUUID(),
    type: input.type,
    targetId: input.targetId ?? null,
    state: 'queued',
    progress: 0,
    error: null,
    errorCode: null,
    errorParams: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    // Taken from the request rather than passed in, so every caller — and
    // every future one — correlates without knowing that it does. Null
    // whenever nothing is tracing, which is every run outside the AppHost.
    traceParent: currentTraceParent(),
    separationModel: input.separationModel ?? null,
    detail: null,
  }
  akapela.db.insert(jobs).values(job).run()
  return job
}

/**
 * Whether any Job is queued or running.
 *
 * `inArray` rather than two queries so the answer is one moment in time: a
 * Job moving from `queued` to `running` between them would otherwise read as
 * nothing happening at all.
 */
export function jobsBusy(akapela: Akapela): boolean {
  const active = akapela.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(inArray(jobs.state, ['queued', 'running']))
    .limit(1)
    .get()
  return active !== undefined
}

export function getJob(akapela: Akapela, id: string): Job | undefined {
  return akapela.db.select().from(jobs).where(eq(jobs.id, id)).get()
}
