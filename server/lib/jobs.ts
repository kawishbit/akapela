import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { JOB_TYPES, jobs, type Job, type JobType } from '../db/schema'
import type { Presto } from './presto'

export function isJobType(value: unknown): value is JobType {
  return typeof value === 'string' && (JOB_TYPES as readonly string[]).includes(value)
}

export function enqueueJob(presto: Presto, input: { type: JobType, targetId?: string | null }): Job {
  const job: Job = {
    id: randomUUID(),
    type: input.type,
    targetId: input.targetId ?? null,
    state: 'queued',
    progress: 0,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  }
  presto.db.insert(jobs).values(job).run()
  return job
}

export function getJob(presto: Presto, id: string): Job | undefined {
  return presto.db.select().from(jobs).where(eq(jobs.id, id)).get()
}
