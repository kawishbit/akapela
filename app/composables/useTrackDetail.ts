import type { TrackDetail } from '~~/server/lib/tracks'

/**
 * One Track with its Lyrics and latest job, fetched the same way by the Track
 * detail page and the Sing page so both agree on what is loaded and on what a
 * missing Track looks like.
 */
export function useTrackDetail(id: Ref<string>) {
  const { data: track, error, refresh } = useAsyncData<TrackDetail>(
    () => `track-${id.value}`,
    () => $fetch<TrackDetail>(`/api/tracks/${id.value}`),
    { watch: [id] },
  )

  const notFound = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)

  // Every action on these pages that starts a Job — a Separation, a Mix, a
  // retry — refreshes the Track afterwards, so refreshing the shared Jobs list
  // alongside is what keeps the Jobs badge in the title bar current.
  const { refresh: refreshJobs } = useJobs()
  async function refreshBoth() {
    await Promise.all([refresh(), refreshJobs()])
  }

  return { track, error, notFound, refresh: refreshBoth }
}
