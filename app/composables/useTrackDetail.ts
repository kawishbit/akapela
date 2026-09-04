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

  return { track, error, notFound, refresh }
}
