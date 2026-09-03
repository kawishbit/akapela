import type { Job } from '~~/server/db/schema'

const TERMINAL: ReadonlySet<Job['state']> = new Set(['succeeded', 'failed'])
const POLL_MS = 500

/**
 * Enqueues a no-op job and polls it to a terminal state. Exists to prove the
 * app-to-worker round trip from the UI; real jobs will reuse the polling.
 */
export function useNoopJob() {
  const job = ref<Job | null>(null)
  const busy = ref(false)
  const failure = ref<string | null>(null)
  const elapsedMs = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function fail(error: unknown) {
    failure.value = error instanceof Error ? error.message : String(error)
    busy.value = false
  }

  async function poll(id: string, startedAt: number) {
    try {
      job.value = await $fetch<Job>(`/api/jobs/${id}`)
    }
    catch (error) {
      return fail(error)
    }
    if (TERMINAL.has(job.value.state)) {
      elapsedMs.value = Date.now() - startedAt
      busy.value = false
      return
    }
    timer = setTimeout(() => poll(id, startedAt), POLL_MS)
  }

  async function run() {
    stop()
    busy.value = true
    failure.value = null
    elapsedMs.value = null
    const startedAt = Date.now()
    try {
      job.value = await $fetch<Job>('/api/jobs', { method: 'POST', body: { type: 'noop' } })
    }
    catch (error) {
      return fail(error)
    }
    await poll(job.value.id, startedAt)
  }

  onBeforeUnmount(stop)

  return { job, busy, failure, elapsedMs, run }
}
