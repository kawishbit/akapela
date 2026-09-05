import { createConsoleRelay } from '~~/app/utils/console-relay'
import { BROWSER_LOG_ENDPOINT, type BrowserLogEntry } from '~~/shared/browser-log'

/**
 * Sends the browser's console errors and warnings to the server, which puts
 * them in the Dashboard alongside everything else — so a failure while
 * recording a Take is visible without opening devtools.
 *
 * Off unless the AppHost is collecting. `import.meta.dev` is what keeps this
 * out of the production bundle entirely; the runtime flag is what keeps
 * `pnpm dev` on its own from posting into a void.
 *
 * The page relays rather than exporting: it holds no OTLP client, needs no CORS
 * on the Dashboard, and adds nothing to the bundle a self-hoster downloads. It
 * also never learns whether anyone listened, which is what stops a failing page
 * from retrying.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.dev || !useRuntimeConfig().public.telemetryEnabled) return

  const route = useRoute()

  function post(entries: BrowserLogEntry[]) {
    const body = JSON.stringify({ entries })
    // `keepalive` so a batch flushed as the tab goes away still leaves.
    // Failures are swallowed: the page is already the thing going wrong.
    fetch(BROWSER_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  }

  const relay = createConsoleRelay({ send: post, page: () => route.fullPath })

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      // The console first, always: devtools must show exactly what it would
      // have shown if none of this were here.
      original(...args)
      relay.record(level, args)
    }
  }

  window.addEventListener('error', (event) => {
    relay.record('error', [event.error ?? event.message])
  })
  window.addEventListener('unhandledrejection', (event) => {
    relay.record('error', ['Unhandled rejection', event.reason])
  })
  // A tab being hidden is the last chance to say anything; on mobile it is
  // often the only notice before the page is frozen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') relay.flush()
  })
})
