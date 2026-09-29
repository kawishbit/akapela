import type { TrackWithJob } from '~~/server/lib/tracks'
import type { ErrorText } from '~/utils/errors'

const POLL_MS = 1000

/**
 * The library: every Track with its latest job, searchable by title or artist.
 * While any Track is importing or separating the list is re-fetched on a short interval so
 * progress, completion, and failure show up without a reload.
 */
export function useLibrary() {
  const { t } = useI18n()
  const player = usePlayer()
  // Every import is a Job; asking the shared list again is what wakes the
  // Jobs badge's poll.
  const { refresh: refreshJobs } = useJobs()
  const query = ref('')
  const uploadError = ref<ErrorText | null>(null)
  const uploading = ref(0)

  const { data, refresh, status } = useAsyncData<TrackWithJob[]>(
    'library',
    () => $fetch<TrackWithJob[]>('/api/tracks', { query: { q: query.value || undefined } }),
    { default: () => [], watch: [query] },
  )
  const tracks = computed(() => data.value ?? [])
  // A separating card links to its Job, so it is watched until it is done too.
  const importing = computed(() => tracks.value.some(track =>
    track.importState === 'importing' || track.separationState === 'separating'))

  let timer: ReturnType<typeof setTimeout> | undefined
  function stopPolling() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  function schedulePoll() {
    stopPolling()
    if (!importing.value) return
    timer = setTimeout(async () => {
      await refresh()
      schedulePoll()
    }, POLL_MS)
  }
  watch(importing, schedulePoll, { immediate: true })
  onBeforeUnmount(stopPolling)

  async function upload(files: Iterable<File>) {
    uploadError.value = null
    const failures: ErrorText[] = []
    for (const file of files) {
      uploading.value++
      try {
        const form = new FormData()
        form.append('file', file, file.name)
        await $fetch('/api/tracks', { method: 'POST', body: form })
        // Show each Track as soon as it exists rather than after the whole batch.
        await Promise.all([refresh(), refreshJobs()])
      }
      catch (error) {
        const { message, details } = describeError(error, t)
        failures.push({ message: t('library.uploadFailed', { file: file.name, reason: message }), details })
      }
      finally {
        uploading.value--
      }
    }
    if (failures.length) {
      uploadError.value = {
        message: failures.map(f => f.message).join('\n'),
        details: failures.map(f => f.details).filter(Boolean).join('\n\n') || null,
      }
    }
  }

  /** Starts an import from a YouTube URL. Rejects with the server's message when the URL is refused. */
  async function importUrl(url: string) {
    await $fetch('/api/tracks', { method: 'POST', body: { url } })
    await Promise.all([refresh(), refreshJobs()])
  }

  async function remove(track: TrackWithJob) {
    await $fetch(`/api/tracks/${track.id}`, { method: 'DELETE' })
    if (player.state.value.track?.id === track.id) player.close()
    await Promise.all([refresh(), refreshJobs()])
  }

  async function retry(track: TrackWithJob) {
    await $fetch(`/api/tracks/${track.id}/retry`, { method: 'POST' })
    await Promise.all([refresh(), refreshJobs()])
  }

  return {
    query,
    tracks,
    loading: computed(() => status.value === 'pending' && tracks.value.length === 0),
    uploading: computed(() => uploading.value > 0),
    uploadError,
    upload,
    importUrl,
    remove,
    retry,
    /** Fetches the list again, and the Jobs with it: after something else started an import. */
    refresh: () => Promise.all([refresh(), refreshJobs()]),
  }
}
