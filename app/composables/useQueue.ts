import type { QueueEntryWithTrack } from '~~/server/lib/queue'

const POLL_MS = 3000

/**
 * Module scope, so one poll however many components ask — see `useJobs`.
 * Only a screen showing the Queue itself polls (`{ poll: true }`); the header
 * count asks once on arrival, on every navigation, and when the window
 * regains focus, which is plenty for a number people glance at.
 */
let pollers = 0
let timer: ReturnType<typeof setTimeout> | undefined
let inFlight: Promise<void> | undefined

/**
 * The Queue: one per install, shared by every device in the house. A couple
 * of seconds' lag on "who's next" costs nothing, so this polls about every
 * three seconds while the Queue page is open, and not at all otherwise.
 */
export function useQueue(options: { poll?: boolean } = {}) {
  const entries = useState<QueueEntryWithTrack[]>('akapela-queue', () => [])
  const loaded = useState<boolean>('akapela-queue-loaded', () => false)
  const error = useState<string | null>('akapela-queue-error', () => null)
  /** While a row is being dragged, a poll must not move it out from under the finger. */
  const holding = useState<boolean>('akapela-queue-holding', () => false)

  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    stop()
    if (pollers === 0) return
    timer = setTimeout(() => void refresh(), POLL_MS)
  }

  /** Fetches the Queue now. */
  function refresh(): Promise<void> {
    inFlight ??= $fetch<QueueEntryWithTrack[]>('/api/queue')
      .then((list) => {
        if (!holding.value) entries.value = list
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

  const onFocus = () => void refresh()
  onMounted(() => {
    if (options.poll) pollers += 1
    window.addEventListener('focus', onFocus)
    void refresh()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', onFocus)
    if (!options.poll) return
    pollers = Math.max(0, pollers - 1)
    if (pollers === 0) stop()
  })

  /** Runs one request that changes the Queue, then reads it back. */
  async function change(request: () => Promise<unknown>) {
    try {
      await request()
    }
    finally {
      await refresh()
    }
  }

  return {
    entries: computed(() => entries.value),
    loaded: computed(() => loaded.value),
    error: computed(() => error.value),
    count: computed(() => entries.value.length),
    holding,
    refresh,
    add: (trackId: string, singerName: string | null) =>
      change(() => $fetch<unknown>('/api/queue', { method: 'POST', body: { trackId, singerName } })),
    remove: (entry: Pick<QueueEntryWithTrack, 'id'>) =>
      change(() => $fetch<unknown>(`/api/queue/${entry.id}`, { method: 'DELETE' })),
    clear: () => change(() => $fetch<unknown>('/api/queue/clear', { method: 'POST' })),
  }
}
