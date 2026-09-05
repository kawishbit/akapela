import {
  BROWSER_LOG_LEVELS,
  MAX_BROWSER_LOG_BATCH,
  MAX_BROWSER_LOG_MESSAGE,
  MAX_BROWSER_LOG_PAGE,
  MAX_BROWSER_LOG_STACK,
  truncate,
  type BrowserLogEntry,
  type BrowserLogLevel,
} from '../../shared/browser-log'

/**
 * The gate between an unauthenticated body posted by a page and the server's
 * telemetry.
 *
 * The rules are deliberately blunt: only warnings and errors, a bounded number
 * of them, each bounded in length, everything else dropped without complaint.
 * A page that has gone wrong is exactly the page most likely to log in a loop,
 * and a relay that faithfully forwarded that would turn a broken screen into a
 * broken Dashboard.
 */

/** A usable string cut to `limit`, or null for anything the page should not have sent. */
function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || value === '') return null
  return truncate(value, limit)
}

function isLevel(value: unknown): value is BrowserLogLevel {
  return typeof value === 'string' && (BROWSER_LOG_LEVELS as readonly string[]).includes(value)
}

/** Reads a posted batch into the entries worth recording. Anything else is dropped. */
export function parseBrowserLogs(body: unknown): BrowserLogEntry[] {
  const entries = (body as { entries?: unknown } | null)?.entries
  if (!Array.isArray(entries)) return []

  const parsed: BrowserLogEntry[] = []
  for (const raw of entries) {
    if (parsed.length === MAX_BROWSER_LOG_BATCH) break
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    const message = text(entry.message, MAX_BROWSER_LOG_MESSAGE)
    if (!isLevel(entry.level) || message === null) continue
    parsed.push({
      level: entry.level,
      message,
      at: typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : null,
      page: text(entry.page, MAX_BROWSER_LOG_PAGE),
      stack: text(entry.stack, MAX_BROWSER_LOG_STACK),
    })
  }
  return parsed
}
