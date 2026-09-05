import { getResponseStatus, type H3Event } from 'h3'
import { isWorthTracing } from '../lib/routes'

/**
 * Turns telemetry on when something is listening, which under `aspire run` is
 * the Aspire Dashboard. Every request worth seeing gets a span, and the
 * browser's console gets somewhere to report to.
 *
 * The `import.meta.dev` guard is not a second opinion about the environment
 * variable — it is what keeps the OpenTelemetry packages out of the production
 * bundle at all. Nuxt replaces it with `false` when building, so everything
 * below, including the dynamic import, is dropped before Nitro ever sees it and
 * the compose image ships without a line of this. The environment check inside
 * is what makes `pnpm dev` on its own export nothing.
 *
 * The span is opened and closed here; `server/middleware/telemetry` marks the
 * stretch in between, for the async-context reason explained there.
 */
export default defineNitroPlugin(async (nitroApp) => {
  if (!import.meta.dev) return

  const { startTelemetry } = await import('../lib/telemetry')
  const telemetry = await startTelemetry()
  if (!telemetry.enabled) return

  nitroApp.hooks.hook('request', (event) => {
    // Somewhere for `/api/telemetry/browser` to put what the page reported.
    // Set on every request so it does not depend on that route being traced.
    event.context.recordBrowserLogs = entries => telemetry.recordBrowserLogs(entries)

    if (!isWorthTracing(event.path)) return
    event.context.trace = telemetry.beginRequest(event.method, event.path) ?? undefined
  })

  // Nitro reports a thrown handler through `error` and then still finishes the
  // response, so the failure is remembered and the span is closed in one place.
  const failures = new WeakMap<H3Event, unknown>()
  nitroApp.hooks.hook('error', (error, { event }) => {
    if (event) failures.set(event, error)
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const trace = event.context.trace
    if (!trace) return
    delete event.context.trace
    event.context.endTrace?.()
    trace.finish(getResponseStatus(event), failures.get(event))
  })

  nitroApp.hooks.hook('close', async () => {
    await telemetry.shutdown()
  })
})
