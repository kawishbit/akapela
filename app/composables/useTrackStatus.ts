import type { TrackWithJob } from '~~/server/lib/tracks'

/**
 * What a Track's card and its row in the list both say about where it is:
 * how far its import has got, why it failed, and where its Job is shown.
 */
export function useTrackStatus(track: () => TrackWithJob) {
  const { t } = useI18n()

  const progress = computed(() => {
    const job = track().job
    if (!job) return 0
    return job.state === 'running' ? job.progress : 0
  })

  const importLabel = computed(() => {
    const job = track().job
    if (!job || job.state === 'queued') return t('trackCard.waiting')
    return t('trackCard.importing', { progress: job.progress })
  })

  const failure = computed(() => {
    const job = track().job
    return job ? describeJobFailure(job, t) : null
  })

  /** A Playlist Import's Track that found nothing on YouTube: retrying it needs a link from the singer. */
  const needsLink = computed(() => track().sourceKind === 'youtube' && !track().sourceRef)

  return { progress, importLabel, failure, needsLink }
}

/** A Job's own row on the Jobs page, which highlights it on arrival. */
export function jobLink(jobId: string | null | undefined): string {
  return jobId ? `/jobs#${jobId}` : '/jobs'
}
