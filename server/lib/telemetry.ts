/**
 * Telemetry for the app's server half: a span per request, and a place for the
 * browser's console to land. Both go to whatever OTLP collector the environment
 * names, which under `aspire run` is the Aspire Dashboard.
 *
 * Two properties make the rest of the codebase able to ignore this file.
 *
 * Nothing is loaded until something is listening. The OpenTelemetry packages
 * are `devDependencies` behind dynamic imports, so `pnpm dev` and the compose
 * image never load them, never open a connection, and need no collector — with
 * no collector configured this returns a handle that answers every call and
 * does nothing, so no caller needs an `if`.
 *
 * Nothing here is on a hot path. A request span is two timestamps and a string;
 * playback and recording happen in the browser and touch none of it. The one
 * server route the audio path uses is a byte range off disk, which gets the
 * same two timestamps as everything else.
 */

import type { LogRecordExporter } from '@opentelemetry/sdk-logs'
import type { SpanExporter } from '@opentelemetry/sdk-trace-node'
import type { BrowserLogEntry } from '../../shared/browser-log'
import { routeTemplate } from './routes'

export interface TelemetryOptions {
  /**
   * Consulted for whether telemetry is on at all, what this service is called,
   * and which certificate to trust. Where a batch actually goes, and the
   * Dashboard's API key header it goes with, the exporters read from the
   * process environment themselves.
   */
  env?: Record<string, string | undefined>
  /** Where spans go. Defaults to the OTLP exporter; tests pass an in-memory one. */
  spanExporter?: SpanExporter
  /** Where the browser's console entries go. Same default, same reason. */
  logExporter?: LogRecordExporter
}

/** One request being traced. Handed out by `beginRequest`, closed exactly once. */
export interface RequestTrace {
  /**
   * The W3C `traceparent` for this request's span. Stored on any Job the
   * request enqueues, which is what lets the worker's span for running that
   * Job join this trace instead of starting a lonely one of its own.
   */
  readonly traceParent: string
  /** Ends the span. `error` is what the handler threw, when it threw. */
  finish(status: number, error?: unknown): void
}

export interface Telemetry {
  /** True only when a collector was configured. */
  readonly enabled: boolean
  /** Opens a span for one request, or null when telemetry is off. */
  beginRequest(method: string, path: string): RequestTrace | null
  /** Records what the browser's console said. Already validated; see `browser-logs`. */
  recordBrowserLogs(entries: BrowserLogEntry[]): void
  /** Sends whatever is batched but not yet exported. */
  flush(): Promise<void>
  /** Flushes and closes. Safe to call on a disabled handle, and safe to call twice. */
  shutdown(): Promise<void>
}

/**
 * Imports a package without the bundler seeing which one.
 *
 * A literal `import('@opentelemetry/…')` is dead code in the production build —
 * the caller is behind `import.meta.dev` — and would still cost the compose
 * image every one of these packages and their dependencies. Rollup resolves a
 * dynamic import and records it as an external while it is building the module
 * graph, which is long before it discards the branch, and Nitro then copies
 * each recorded external into `.output`. A specifier it cannot read is a
 * specifier it cannot record, which is what keeps these a development-time
 * dependency the way ADR 0007 asks. The type argument is erased, so nothing is
 * lost but the bundler's certainty.
 */
function load<T>(specifier: string): Promise<T> {
  return import(/* @vite-ignore */ specifier) as Promise<T>
}

const DISABLED: Telemetry = {
  enabled: false,
  beginRequest: () => null,
  recordBrowserLogs: () => {},
  flush: async () => {},
  shutdown: async () => {},
}

/**
 * Starts telemetry, or returns the do-nothing handle when no collector is
 * configured — which is every run that is not under the AppHost.
 */
export async function startTelemetry(options: TelemetryOptions = {}): Promise<Telemetry> {
  const env = options.env ?? process.env
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return DISABLED

  const [{ SpanKind, SpanStatusCode }, { SeverityNumber }, { resourceFromAttributes }, trace, logs]
    = await Promise.all([
      load<typeof import('@opentelemetry/api')>('@opentelemetry/api'),
      load<typeof import('@opentelemetry/api-logs')>('@opentelemetry/api-logs'),
      load<typeof import('@opentelemetry/resources')>('@opentelemetry/resources'),
      load<typeof import('@opentelemetry/sdk-trace-node')>('@opentelemetry/sdk-trace-node'),
      load<typeof import('@opentelemetry/sdk-logs')>('@opentelemetry/sdk-logs'),
    ])

  // Aspire names each resource for us; the fallback is only ever reached by a
  // collector configured by hand.
  const resource = resourceFromAttributes({ 'service.name': env.OTEL_SERVICE_NAME || 'akapela-app' })

  // gRPC because that is the only protocol the Aspire Dashboard's OTLP
  // endpoint speaks; everything else about where and how comes from the
  // environment Aspire already set, including the API key header. Skipped
  // entirely when both exporters were passed in, which is what the tests do.
  const exporting = options.spanExporter && options.logExporter
    ? {}
    : { credentials: await channelCredentials(env) }

  const spanExporter = options.spanExporter
    ?? new (await load<typeof import('@opentelemetry/exporter-trace-otlp-grpc')>(
      '@opentelemetry/exporter-trace-otlp-grpc')).OTLPTraceExporter(exporting)
  const logExporter = options.logExporter
    ?? new (await load<typeof import('@opentelemetry/exporter-logs-otlp-grpc')>(
      '@opentelemetry/exporter-logs-otlp-grpc')).OTLPLogExporter(exporting)

  // Deliberately not registered as the global provider. Nothing here relies on
  // an ambient active span — a request hands its `traceparent` on explicitly —
  // and staying out of the globals keeps two of these in one process (which is
  // what the tests do) from being one.
  const tracerProvider = new trace.NodeTracerProvider({
    resource,
    spanProcessors: [new trace.BatchSpanProcessor(spanExporter)],
  })
  const loggerProvider = new logs.LoggerProvider({
    resource,
    processors: [new logs.BatchLogRecordProcessor({ exporter: logExporter })],
  })

  const tracer = tracerProvider.getTracer('akapela-app')
  const logger = loggerProvider.getLogger('akapela-browser')

  return {
    enabled: true,

    beginRequest(method, path) {
      const route = routeTemplate(path)
      const span = tracer.startSpan(`${method} ${route}`, {
        kind: SpanKind.SERVER,
        attributes: { 'http.request.method': method, 'http.route': route, 'url.path': path },
      })
      const { traceId, spanId, traceFlags } = span.spanContext()
      return {
        traceParent: `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, '0')}`,
        finish(status, error) {
          span.setAttribute('http.response.status_code', status)
          if (error !== undefined) span.recordException(error as Error)
          // A 404 or a 400 is the API doing its job, so only the server's own
          // failures are coloured as errors; the status code carries the rest.
          if (status >= 500 || error !== undefined) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) })
          }
          span.end()
        },
      }
    },

    recordBrowserLogs(entries) {
      for (const entry of entries) {
        logger.emit({
          body: entry.message,
          severityText: entry.level,
          severityNumber: entry.level === 'error' ? SeverityNumber.ERROR : SeverityNumber.WARN,
          timestamp: entry.at ?? undefined,
          attributes: {
            // Without this a browser error reads as one the server raised,
            // which is the opposite of the diagnosis.
            'akapela.origin': 'browser',
            ...(entry.page === null ? {} : { 'url.path': entry.page }),
            ...(entry.stack === null ? {} : { 'exception.stacktrace': entry.stack }),
          },
        })
      }
    },

    async flush() {
      await Promise.all([tracerProvider.forceFlush(), loggerProvider.forceFlush()])
    },

    async shutdown() {
      await Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown()])
    },
  }
}

/**
 * How to trust the collector. Aspire's Dashboard serves OTLP over TLS with a
 * certificate it generates per run, and tells each resource where that
 * certificate is — but in the name its own runtime reads, which for Node is
 * `NODE_EXTRA_CA_CERTS` and not the `OTEL_EXPORTER_OTLP_CERTIFICATE` the gRPC
 * exporter looks for. Reading whichever is set is what saves a contributor
 * from a Dashboard with no traces in it and nothing saying why.
 */
async function channelCredentials(env: Record<string, string | undefined>) {
  const { credentials } = await load<typeof import('@grpc/grpc-js')>('@grpc/grpc-js')
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? ''
  if (!endpoint.startsWith('https:')) return credentials.createInsecure()
  const authority = env.OTEL_EXPORTER_OTLP_CERTIFICATE || env.NODE_EXTRA_CA_CERTS
  const { readFile } = await import('node:fs/promises')
  return credentials.createSsl(authority ? await readFile(authority) : undefined)
}

function errorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined
  return error instanceof Error ? error.message : String(error)
}
