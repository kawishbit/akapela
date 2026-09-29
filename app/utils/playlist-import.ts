import type { JobListEntry } from '~~/server/lib/job-actions'
import type { Translate } from './i18n'
import { isActiveJob, jobSections } from './jobs'

/**
 * What the checklist page and the Jobs page make of a Playlist Import. Plain
 * functions, so the suite checks the numbers and the words without mounting a
 * page.
 */

/** How long separating these songs will take here: this install's own rate, times their length. */
export function separationEstimateMs(msPerAudioMs: number, durationsMs: readonly number[]): number {
  return msPerAudioMs * durationsMs.reduce((sum, ms) => sum + ms, 0)
}

const MINUTE = 60_000

/**
 * An estimate in the words the summary reads it in, rounded kindly: whole
 * minutes up to ten, then to five minutes, then from an hour up to ten
 * minutes. It is a guess, and says so by being round.
 */
export function formatEstimate(ms: number, t: Translate): string {
  if (ms < MINUTE) return t('playlistImport.estimate.underMinute')
  const minutes = ms / MINUTE
  if (minutes < 10) return t('playlistImport.estimate.minutes', { minutes: Math.round(minutes) })
  if (Math.round(minutes / 5) * 5 < 60) return t('playlistImport.estimate.minutes', { minutes: Math.round(minutes / 5) * 5 })
  const rounded = Math.round(minutes / 10) * 10
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest
    ? t('playlistImport.estimate.hoursMinutes', { hours, minutes: rest })
    : t('playlistImport.estimate.hours', { hours })
}

/** One Playlist Import as the Jobs page shows it: one row that opens into its Jobs. */
export interface PlaylistImportGroup {
  id: string
  name: string
  /** Its Jobs in the order the page lists any: running, queued, then finished. */
  jobs: JobListEntry[]
  /** How many songs it is importing: one import Job each. */
  songs: number
  imported: number
  separated: number
  failed: number
  /** Whether anything is still queued or running, which is what Cancel all acts on. */
  active: boolean
}

/**
 * The Jobs with a Playlist Import label, one group per Playlist Import, in the
 * order they were started; and every other Job, which the page lists as it
 * always has. A group goes once its last Job has been cleared.
 */
export function playlistImportGroups(jobs: readonly JobListEntry[]): { groups: PlaylistImportGroup[], others: JobListEntry[] } {
  const byId = new Map<string, JobListEntry[]>()
  const others: JobListEntry[] = []
  for (const job of [...jobs].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!job.playlistImportId) {
      others.push(job)
      continue
    }
    const group = byId.get(job.playlistImportId) ?? []
    group.push(job)
    byId.set(job.playlistImportId, group)
  }
  const groups = [...byId].map(([id, members]): PlaylistImportGroup => {
    const sections = jobSections(members)
    const imports = members.filter(job => job.type === 'import')
    return {
      id,
      name: members.find(job => job.playlistImportName)?.playlistImportName ?? '',
      jobs: [...sections.running, ...sections.queued, ...sections.finished],
      songs: imports.length,
      imported: imports.filter(job => job.state === 'succeeded').length,
      separated: members.filter(job => job.type === 'separate' && job.state === 'succeeded').length,
      failed: members.filter(job => job.state === 'failed').length,
      active: members.some(isActiveJob),
    }
  })
  return { groups, others }
}
