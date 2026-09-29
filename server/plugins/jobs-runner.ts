import { DEFAULT_HANDLERS, JobsRunner } from '../lib/jobs-runner'
import { LANES } from '../lib/jobs'
import { MdxNetSeparator, separateHandler } from '../lib/jobs/separate'
import { importHandler } from '../lib/jobs/import-track'
import { YtDlpFetcher } from '../lib/sources'
import { playlistImportFollowUp } from '../lib/playlist-imports'
import { useAkapela } from '../lib/use-akapela'
import type { Telemetry } from '../lib/telemetry'

const DEFAULT_POLL_INTERVAL_MS = 1000

/**
 * Starts the in-process Job runner as soon as the server boots — this plugin
 * is what replaced the Python worker's own polling process (ADR 0002; ticket
 * 02 of `.scratch/worker-to-typescript/`). Three `JobsRunner`s per server
 * process, one per Lane (ADR 0012 and its amendment), each claiming and
 * running its own share of what is queued in the same `jobs` table the API
 * routes write to. Stale Jobs from a process that died are requeued once,
 * before any starts, so no two loops both requeue the same rows.
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
    .then((telemetry) => {
      // The separate Job asks the same hardware detection Settings shows, so
      // the two can never disagree about what this machine has.
      // A Playlist Import's Track fetches its Lyrics and queues its Separation
      // once imported, which needs the whole app, not just the Jobs table.
      const handlers = {
        ...DEFAULT_HANDLERS,
        import: importHandler(new YtDlpFetcher(), { followUp: playlistImportFollowUp(akapela) }),
        separate: separateHandler(new MdxNetSeparator(), akapela.hardware),
      }
      const runners = LANES.map(lane => new JobsRunner(akapela.sqlite, akapela.dataDir, {
        handlers,
        telemetry,
        lane,
        running: akapela.runningJobs,
      }))
      runners[0]!.recoverStaleJobs()
      return Promise.all(runners.map(runner => runner.runForever(pollIntervalMs, stopping.signal)))
    })
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
