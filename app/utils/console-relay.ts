import {
  MAX_BROWSER_LOG_BATCH,
  MAX_BROWSER_LOG_MESSAGE,
  MAX_BROWSER_LOG_PAGE,
  MAX_BROWSER_LOG_STACK,
  truncate,
  type BrowserLogEntry,
  type BrowserLogLevel,
} from '~~/shared/browser-log'

/**
 * Collects what the page's console says and hands it over in batches.
 *
 * Two things this deliberately is not. It is not a logger: nothing in Akapela
 * logs to the console on purpose, so everything reaching here is a failure
 * somebody wants to see. And it is not reliable: a batch that overflows is
 * dropped and a send that fails is forgotten, because the page whose console is
 * on fire must not spend the singer's CPU on telling anyone about it. Recording
 * an entry is a push and a `setTimeout`; recording a Take never touches it.
 *
 * `send`, `page`, and `now` are injected so this is testable without a browser,
 * and so the plugin above decides how a batch actually travels.
 */

export interface ConsoleRelayOptions {
  /** Ships one batch. Never called with an empty one. */
  send: (entries: BrowserLogEntry[]) => void
  /** Where the page is when an entry is recorded. */
  page: () => string | null
  /** How long entries collect before a batch goes out. */
  delayMs?: number
  now?: () => number
}

export interface ConsoleRelay {
  /** Queues one console call. */
  record: (level: BrowserLogLevel, args: unknown[]) => void
  /** Ships whatever is queued, if anything. */
  flush: () => void
}

/** One console argument as the console would have shown it. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value) ?? String(value)
  }
  catch {
    // Circular, or a getter that throws. The value is not worth a second
    // failure, and its type is usually enough to recognise it by.
    return Object.prototype.toString.call(value)
  }
}

function pageOrNull(page: string | null): string | null {
  return page === null ? null : truncate(page, MAX_BROWSER_LOG_PAGE)
}

export function createConsoleRelay(options: ConsoleRelayOptions): ConsoleRelay {
  const delayMs = options.delayMs ?? 2000
  const now = options.now ?? Date.now
  const queued: BrowserLogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (queued.length === 0) return
    options.send(queued.splice(0, queued.length))
  }

  return {
    record(level, args) {
      // Full is full. Dropping the newest keeps the first failure — the one
      // that usually explains the hundred after it — rather than the last.
      if (queued.length >= MAX_BROWSER_LOG_BATCH) return
      const error = args.find(argument => argument instanceof Error)
      queued.push({
        level,
        message: truncate(args.map(asText).join(' '), MAX_BROWSER_LOG_MESSAGE),
        at: now(),
        page: pageOrNull(options.page()),
        stack: error?.stack ? truncate(error.stack, MAX_BROWSER_LOG_STACK) : null,
      })
      if (timer === null) timer = setTimeout(flush, delayMs)
    },
    flush,
  }
}
