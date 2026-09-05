import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { parseBrowserLogs } from '../../lib/browser-logs'

/**
 * Where the browser's console errors and warnings land, so a failure while
 * recording a Take shows up in the Dashboard rather than only in devtools.
 *
 * Development only, and enforced rather than assumed: Nuxt replaces
 * `import.meta.dev` with `false` when building, so what ships in the compose
 * image is a route that 404s before reading a byte. Nothing here would export
 * anything in production either way, but a self-hoster should not be running an
 * unauthenticated endpoint that reads an arbitrary body to throw it away — the
 * AppHost is a development-time overlay and nothing else (ADR 0007).
 *
 * The page relays; the server decides. Nothing here reports back — the answer
 * is 204 whether telemetry is on, whether the batch was usable, and whether
 * anything at all was recorded. A page that learned its logs were rejected
 * would be a page that could retry, and the one page most likely to retry is
 * the one already failing.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
  const entries = parseBrowserLogs(await readBody(event).catch(() => null))
  if (entries.length > 0) event.context.recordBrowserLogs?.(entries)
  setResponseStatus(event, 204)
  return null
})
