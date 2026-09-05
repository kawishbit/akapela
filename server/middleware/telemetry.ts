import { defineEventHandler } from 'h3'
import { traceRequestAs } from '../lib/request-trace'

/**
 * Puts the request inside its own trace, so a Job enqueued while serving it is
 * stamped with that trace and the worker's span joins in.
 *
 * This is middleware rather than part of the telemetry plugin because of where
 * the two run. The plugin's `request` hook is called through hookable, from
 * inside a promise callback, and a store entered there is gone by the time the
 * handler runs. Middleware is called by h3 in the request's own async context,
 * which is exactly the context that has to carry it. The plugin still opens and
 * closes the span; this only marks the stretch in between.
 *
 * Every traced request enters a store — including, deliberately, the ones with
 * no trace. `enterWith` reaches the frame that called it, and under keep-alive
 * two requests can share that frame, so a request that entered nothing could
 * see whatever its predecessor left. Entering `null` is what makes that
 * impossible rather than merely unlikely.
 *
 * Development only: `import.meta.dev` is `false` in the compose image, so this
 * is a no-op the bundler removes.
 */
export default defineEventHandler((event) => {
  if (!import.meta.dev) return
  event.context.endTrace = traceRequestAs(event.context.trace?.traceParent ?? null)
})
