/**
 * What the browser relays to `/api/telemetry/browser`, so a failure while
 * recording a Take is visible in the Dashboard without opening devtools.
 *
 * Shared because both ends need the same limits: the page truncates before it
 * sends, and the server truncates again on the way in — the page is the half
 * that has gone wrong, so its numbers are a courtesy and the server's are the
 * rule. See `server/lib/browser-logs` for the enforcement.
 */

/** Console levels worth a contributor's attention. `log` and `debug` are noise. */
export const BROWSER_LOG_LEVELS = ['warn', 'error'] as const

export type BrowserLogLevel = (typeof BROWSER_LOG_LEVELS)[number]

export interface BrowserLogEntry {
  level: BrowserLogLevel
  message: string
  /** When the browser saw it, in epoch milliseconds, or null when it said nothing usable. */
  at: number | null
  /** The route the page was on, which is usually the whole diagnosis. */
  page: string | null
  stack: string | null
}

/** At most this many entries per request; the rest of the batch is dropped. */
export const MAX_BROWSER_LOG_BATCH = 32

/** Longer messages are truncated to this many characters. */
export const MAX_BROWSER_LOG_MESSAGE = 2000

/** Stacks are allowed more room than messages, but not unlimited room. */
export const MAX_BROWSER_LOG_STACK = 4000

/** A route, not a URL, so this is generous already. */
export const MAX_BROWSER_LOG_PAGE = 500

/** Cuts a string to `limit`, which is what both ends do to every field. */
export function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value
}

/** The route the page reports to. Excluded from tracing; see `server/lib/routes`. */
export const BROWSER_LOG_ENDPOINT = '/api/telemetry/browser'
