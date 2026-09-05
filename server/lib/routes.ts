/**
 * Which requests are worth a span, and what to call the span.
 *
 * A span named for the URL it was asked about is one span per Track, which is
 * a trace list nobody can read. Names have to be low cardinality — the *route*,
 * not the request — so every `GET /api/tracks/:id` groups together and the
 * outlier is visible. Nitro knows the route it matched, but only inside its own
 * router; by the time a span is opened the path is all there is, so identifiers
 * are recognised and folded back into the template they came from. The full
 * path is still recorded on the span as an attribute, so nothing is lost.
 */

/** A v4-shaped UUID, which is what `randomUUID()` gives every row an id of. */
const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A request path without its query string, which is no part of the route. */
function pathOnly(path: string): string {
  return path.split('?')[0] ?? ''
}

/** `/api/tracks/2f8a…/takes/7d1e…` → `/api/tracks/:id/takes/:id`. */
export function routeTemplate(path: string): string {
  const segments = pathOnly(path).split('/').map(segment => (ID_SEGMENT.test(segment) ? ':id' : segment))
  // Rebuilding from segments drops a trailing slash on its own, which stops
  // `/api/tracks` and `/api/tracks/` becoming two names for one route.
  const template = segments.filter((segment, index) => segment !== '' || index === 0).join('/')
  return template === '' ? '/' : template
}

/**
 * Everything Nitro serves that is not the app itself: the dev server's module
 * graph, the assets a browser fetches on its own, and the relay a page reports
 * its own errors through. One page load in development is dozens of these, and
 * tracing them would bury the handful of API calls the trace list exists to
 * show. Prefixes rather than a list of names, because the dev server invents
 * new paths under these as it goes.
 */
const NOT_WORTH_TRACING = [
  // Nuxt's build output, its devtools, and Vite's own module and filesystem
  // routes, which only exist while `nuxt dev` is running.
  '/_nuxt/',
  '/__nuxt',
  '/_ipx/',
  '/@vite/',
  '/@fs/',
  '/@id/',
  // Asked for by the browser, not by anything a contributor did.
  '/favicon.ico',
  '/sw.js',
  '/manifest.webmanifest',
  '/icons/',
  '/.well-known/',
  // Tracing the browser's own error report would mean a broken page generating
  // traffic about the traffic it generates.
  '/api/telemetry/',
]

/** Whether a request is one a contributor following a failure would want to see. */
export function isWorthTracing(path: string): boolean {
  const withoutQuery = pathOnly(path)
  return !NOT_WORTH_TRACING.some(prefix => withoutQuery.startsWith(prefix))
}
