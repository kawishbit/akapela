import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Which trace the request currently being handled belongs to.
 *
 * A Job enqueued while serving a request should carry that request's
 * `traceparent`, so the worker's span for running it joins the trace the click
 * started rather than floating alone. But `enqueueJob` sits below the route
 * handler that has the span — under `createMix`, `retryMix`,
 * `createTrackFromUpload`, `retryImport` — and threading a telemetry string
 * down would put it in six signatures with no other reason to know about
 * tracing, where the next function to enqueue a Job would have to remember to
 * thread it too and correlation would break quietly when it did not.
 *
 * So the request carries it out of band. `enterWith` rather than `run` because
 * a Nitro request hook has no handler to wrap: it is called inside the
 * request's own async context, which is exactly the context the store should
 * cover. What `enterWith` cannot do is give the store back when the request is
 * over — it also reaches whatever synchronous frame called it, which under
 * keep-alive can be a frame the next request on the same socket shares — so
 * what is stored is a box the response empties, and an untraced request enters
 * an empty box of its own rather than entering nothing. A context that outlives
 * a request then holds no trace rather than a stale one, which is the
 * difference between telemetry that reads worse and telemetry that lies.
 */
const storage = new AsyncLocalStorage<{ traceParent: string | null }>()

/**
 * Marks everything the request goes on to do as part of `traceParent`, or as
 * part of no trace at all when it is null — which is how a request says it is
 * not the previous one. Returns the function to call once the response is out.
 */
export function traceRequestAs(traceParent: string | null): () => void {
  const request = { traceParent }
  storage.enterWith(request)
  return () => {
    request.traceParent = null
  }
}

/** The trace the current request belongs to, or null when nothing is tracing. */
export function currentTraceParent(): string | null {
  return storage.getStore()?.traceParent ?? null
}
