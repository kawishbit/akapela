import { JobsRunner } from '../lib/jobs-runner'
import { useAkapela } from '../lib/use-akapela'
import type { Telemetry } from '../lib/telemetry'

const DEFAULT_POLL_INTERVAL_MS = 1000

/**
 * Starts the in-process Job runner as soon as the server boots — this plugin
 * is what replaced the Python worker's own polling process (ADR 0002; ticket
 * 02 of `.scratch/worker-to-typescript/`). One `JobsRunner` per server
 * process, claiming and running whatever is queued in the same `jobs` table
 * the API routes write to.
 *
 * Runs unconditionally, in development and in the compose image alike —
 * unlike `telemetry.ts`, this is not a dev-only overlay, it is what makes a
 * Track ever finish importing.
 */
export default defineNitroPlugin((nitroApp) => {
  const akapela = useAkapela()
  const pollIntervalMs = Number(process.env.AKAPELA_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS
  const stopping = new AbortController()

  const loop = loadTelemetry()
    .then(telemetry => new JobsRunner(akapela.sqlite, akapela.dataDir, { telemetry }))
    .then(runner => runner.runForever(pollIntervalMs, stopping.signal))
    .catch((error) => {
      console.error('jobs runner stopped unexpectedly:', error)
    })

  nitroApp.hooks.hook('close', async () => {
    stopping.abort()
    await loop
  })
})

/**
 * Job tracing is the same dev-only overlay `telemetry.ts` is (ADR 0007): the
 * `import.meta.dev` guard is what a production build replaces with `false`
 * and strips, which is what keeps the OpenTelemetry packages — and the
 * network call `startTelemetry` would otherwise make — out of `.output`
 * entirely. A second, independent `Telemetry` instance from the one the
 * request-tracing plugin holds; both point at the same collector when one is
 * configured; a Job's span still joins its enqueuing request's trace via the
 * `traceparent` stamped on the row, not via sharing a process-wide handle.
 */
async function loadTelemetry(): Promise<Telemetry | undefined> {
  if (!import.meta.dev) return undefined
  const { startTelemetry } = await import('../lib/telemetry')
  return startTelemetry()
}
