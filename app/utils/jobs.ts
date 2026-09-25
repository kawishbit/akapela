import type { JobType } from '~~/server/db/schema'
import type { JobListEntry } from '~~/server/lib/job-actions'
import type { Lane } from '~~/server/lib/jobs'

/**
 * What the Jobs page makes of `GET /api/jobs`. Plain functions, so the suite
 * checks the sections and the words without mounting a page.
 */

export interface JobSections {
  /** At most one per Lane. */
  running: JobListEntry[]
  /** In the order they will run. */
  queued: JobListEntry[]
  /** Newest first. */
  finished: JobListEntry[]
}

export function isActiveJob(job: Pick<JobListEntry, 'state'>): boolean {
  return job.state === 'queued' || job.state === 'running'
}

export function jobSections(jobs: readonly JobListEntry[]): JobSections {
  const byCreation = [...jobs].sort((a, b) => a.createdAt - b.createdAt)
  return {
    running: byCreation.filter(job => job.state === 'running'),
    queued: byCreation.filter(job => job.state === 'queued'),
    finished: byCreation
      .filter(job => !isActiveJob(job))
      .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt)),
  }
}

/** How many Jobs are queued or running: what the Jobs link's badge shows. */
export function activeJobCount(jobs: readonly Pick<JobListEntry, 'state'>[]): number {
  return jobs.filter(isActiveJob).length
}

const ACTIVITIES: Partial<Record<JobType, string>> = {
  import: 'Importing',
  separate: 'Separating',
  render: 'Mixing',
}

/** What a Job is doing, in a word. A type without one of its own still gets a row. */
export function jobActivity(type: JobType): string {
  return ACTIVITIES[type] ?? 'Working'
}

/** What a queued Job waits behind. The UI never says "Lane". */
export function queuedBehind(lane: Lane): string {
  return lane === 'heavy' ? 'Waits for other Separations' : 'Waits for imports and Mixes'
}

/** Which Take a Mix is of: "Take 2, 14:03", since a Track can have several queued for mixing at once. */
export function takeLabel(take: NonNullable<JobListEntry['take']>): string {
  const time = new Date(take.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `Take ${take.number}, ${time}`
}
