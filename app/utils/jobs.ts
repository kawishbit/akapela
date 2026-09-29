import type { JobType } from '~~/server/db/schema'
import { DEFAULT_SEPARATION_MODEL } from '~~/server/lib/separators/models'
import type { JobListEntry } from '~~/server/lib/job-actions'
import type { Lane } from '~~/server/lib/jobs'
import { isJobDetail } from '~~/shared/job-detail'
import type { Translate } from './i18n'

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

const ACTIVITIES: readonly string[] = ['import', 'separate', 'render'] satisfies JobType[]

/** What a Job is doing, in a word. A type without one of its own still gets a row. */
export function jobActivity(type: JobType, t: Translate): string {
  return ACTIVITIES.includes(type) ? t(`jobs.activity.${type}`) : t('jobs.activity.other')
}

/** What a queued Job waits behind. The UI never says "Lane". */
export function queuedBehind(lane: Lane, t: Translate): string {
  return lane === 'heavy' ? t('jobs.waitsHeavy') : t('jobs.waitsLight')
}

/**
 * The line a Job adds about what it is doing (`shared/job-detail.ts`), in
 * words. A row from before the tokens holds English already, shown as it is.
 */
export function jobDetailText(job: Pick<JobListEntry, 'detail' | 'separationModel'>, t: Translate): string | null {
  if (!job.detail) return null
  if (!isJobDetail(job.detail)) return job.detail
  return t(`jobs.detail.${job.detail}`, { model: job.separationModel ?? DEFAULT_SEPARATION_MODEL })
}

/**
 * Which Take a Mix is of: "Take 2, 14:03", since a Track can have several
 * queued for mixing at once. The time is written the chosen Language's way.
 */
export function takeLabel(take: NonNullable<JobListEntry['take']>, t: Translate, locale: string): string {
  const time = new Date(take.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return t('jobs.takeLabel', { number: take.number, time })
}
