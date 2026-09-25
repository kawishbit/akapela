import type { JobListEntry } from '~~/server/lib/job-actions'
import { activeJobCount } from '~/utils/jobs'

const POLL_MS = 1000

/**
 * Module scope, so there is one poll however many components ask: the Jobs
 * page and the Jobs link's badge are two views of one list, and two timers
 * polling one route is work for nothing — the pattern `useUpdates` uses.
 */
let subscribers = 0
let timer: ReturnType<typeof setTimeout> | undefined
let inFlight: Promise<void> | undefined
let onFocus: (() => void) | undefined

/**
 * Every Job, as `GET /api/jobs` lists them, shared by every component that
 * asks. Polled about once a second while anything is queued or running, and
 * not at all once everything is idle — the pattern `useLibrary` uses while
 * importing. Something that starts a Job calls `refresh()`, which is what
 * wakes the poll back up; so does the window regaining focus, which is how a
 * Job started from another device turns up without a timer running while
 * idle. No SSE.
 */
export function useJobs() {
  const jobs = useState<JobListEntry[]>('akapela-jobs', () => [])
  const loaded = useState<boolean>('akapela-jobs-loaded', () => false)
  const error = useState<string | null>('akapela-jobs-error', () => null)

  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    stop()
    if (subscribers === 0 || activeJobCount(jobs.value) === 0) return
    timer = setTimeout(() => void refresh(), POLL_MS)
  }

  /** Fetches the list now, and keeps polling while anything is still going. */
  function refresh(): Promise<void> {
    inFlight ??= $fetch<JobListEntry[]>('/api/jobs')
      .then((list) => {
        jobs.value = list
        error.value = null
      })
      .catch((failure) => {
        error.value = describeError(failure)
      })
      .finally(() => {
        loaded.value = true
        inFlight = undefined
        schedule()
      })
    return inFlight
  }

  onMounted(() => {
    subscribers += 1
    if (!onFocus) {
      onFocus = () => void refresh()
      window.addEventListener('focus', onFocus)
    }
    void refresh()
  })

  onBeforeUnmount(() => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers > 0) return
    stop()
    if (onFocus) window.removeEventListener('focus', onFocus)
    onFocus = undefined
  })

  async function act(path: string) {
    try {
      await $fetch(path, { method: 'POST' })
    }
    finally {
      await refresh()
    }
  }

  return {
    jobs: computed(() => jobs.value),
    loaded: computed(() => loaded.value),
    error: computed(() => error.value),
    activeCount: computed(() => activeJobCount(jobs.value)),
    refresh,
    cancel: (job: JobListEntry) => act(`/api/jobs/${job.id}/cancel`),
    retry: (job: JobListEntry) => act(`/api/jobs/${job.id}/retry`),
    clearFinished: () => act('/api/jobs/clear'),
  }
}
