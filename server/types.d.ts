import type { Akapela } from './lib/akapela'
import type { RequestTrace } from './lib/telemetry'
import type { BrowserLogEntry } from '../shared/browser-log'

declare module 'h3' {
  interface H3EventContext {
    akapela: Akapela
    /**
     * The span for this request, when telemetry is on. Absent under `pnpm dev`
     * and in the compose image, where nothing is collecting — so every reader
     * treats it as optional rather than branching on a mode.
     */
    trace?: RequestTrace
    /** Releases the request's trace store; see `server/middleware/telemetry`. */
    endTrace?: () => void
    /** Where the browser's relayed console entries go, when telemetry is on. */
    recordBrowserLogs?: (entries: BrowserLogEntry[]) => void
  }
}

export {}
