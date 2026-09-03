import type { TrackWithJob } from '~~/server/lib/tracks'

const POLL_MS = 1000

/**
 * The library: every Track with its latest job, searchable by title or artist.
 * While any Track is importing the list is re-fetched on a short interval so
 * progress, completion, and failure show up without a reload.
 */
export function useLibrary() {
  const query = ref('')
  const uploadError = ref<string | null>(null)
  const uploading = ref(0)

  const { data, refresh, status } = useAsyncData<TrackWithJob[]>(
    'library',
    () => $fetch<TrackWithJob[]>('/api/tracks', { query: { q: query.value || undefined } }),
    { default: () => [], watch: [query] },
  )
  const tracks = computed(() => data.value ?? [])
  const importing = computed(() => tracks.value.some(track => track.importState === 'importing'))

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
    const failures: string[] = []
    for (const file of files) {
      uploading.value++
      try {
        const form = new FormData()
        form.append('file', file, file.name)
        await $fetch('/api/tracks', { method: 'POST', body: form })
        // Show each Track as soon as it exists rather than after the whole batch.
        await refresh()
      }
      catch (error) {
        failures.push(`${file.name}: ${describeError(error)}`)
      }
      finally {
        uploading.value--
      }
    }
    if (failures.length) uploadError.value = failures.join('\n')
  }

  async function remove(track: TrackWithJob) {
    await $fetch(`/api/tracks/${track.id}`, { method: 'DELETE' })
    await refresh()
  }

  async function retry(track: TrackWithJob) {
    await $fetch(`/api/tracks/${track.id}/retry`, { method: 'POST' })
    await refresh()
  }

  return {
    query,
    tracks,
    loading: computed(() => status.value === 'pending' && tracks.value.length === 0),
    uploading: computed(() => uploading.value > 0),
    uploadError,
    upload,
    remove,
    retry,
  }
}
