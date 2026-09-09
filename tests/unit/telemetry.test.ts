import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node'
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs'
import { afterEach, describe, expect, test } from 'vitest'
import { startTelemetry, type Telemetry } from '../../server/lib/telemetry'

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/

let telemetry: Telemetry | null = null

afterEach(async () => {
  await telemetry?.shutdown()
  telemetry = null
})

/** Telemetry as the AppHost starts it, but exporting into memory. */
async function started() {
  const spans = new InMemorySpanExporter()
  const logs = new InMemoryLogRecordExporter()
  telemetry = await startTelemetry({
    env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318', OTEL_SERVICE_NAME: 'app' },
    spanExporter: spans,
    logExporter: logs,
  })
  return { spans, logs }
}

describe('startTelemetry', () => {
  test('exports nothing when no collector is configured', async () => {
    telemetry = await startTelemetry({ env: {} })
    expect(telemetry.enabled).toBe(false)
    expect(telemetry.beginRequest('GET', '/api/tracks')).toBeNull()
  })

  test('a disabled telemetry still answers every call, so callers need no branch', async () => {
    telemetry = await startTelemetry({ env: {} })
    expect(() => telemetry!.recordBrowserLogs([
      { level: 'error', message: 'boom', at: null, page: null, stack: null },
    ])).not.toThrow()
    await expect(telemetry.flush()).resolves.toBeUndefined()
    await expect(telemetry.shutdown()).resolves.toBeUndefined()
  })
})

describe('request spans', () => {
  test('a request is a span named for its route, not its URL', async () => {
    const { spans } = await started()
    telemetry!.beginRequest('POST', '/api/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44/takes')!.finish(201)
    await telemetry!.flush()

    const [span] = spans.getFinishedSpans()
    expect(span?.name).toBe('POST /api/tracks/:id/takes')
    expect(span?.attributes['http.request.method']).toBe('POST')
    expect(span?.attributes['http.route']).toBe('/api/tracks/:id/takes')
    expect(span?.attributes['http.response.status_code']).toBe(201)
  })

  test('the full path is kept as an attribute, so the one Track is still findable', async () => {
    const { spans } = await started()
    telemetry!.beginRequest('GET', '/api/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44')!.finish(200)
    await telemetry!.flush()

    expect(spans.getFinishedSpans()[0]?.attributes['url.path'])
      .toBe('/api/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44')
  })

  test('the request hands out a traceparent, which is what a Job it enqueues carries', async () => {
    await started()
    const request = telemetry!.beginRequest('POST', '/api/jobs')!
    expect(request.traceParent).toMatch(TRACEPARENT)
    request.finish(201)
  })

  test('the traceparent names the span it came from', async () => {
    const { spans } = await started()
    const request = telemetry!.beginRequest('POST', '/api/jobs')!
    const { traceParent } = request
    request.finish(201)
    await telemetry!.flush()

    const [span] = spans.getFinishedSpans()
    expect(traceParent).toBe(`00-${span!.spanContext().traceId}-${span!.spanContext().spanId}-01`)
  })

  test('a failed request is an error span carrying what went wrong', async () => {
    const { spans } = await started()
    telemetry!.beginRequest('POST', '/api/tracks')!.finish(500, new Error('disk full'))
    await telemetry!.flush()

    const [span] = spans.getFinishedSpans()
    expect(span?.status.code).toBe(2)
    expect(span?.events.some(event => event.name === 'exception')).toBe(true)
  })

  test('a 4xx is recorded but not called an error: the caller asked for it', async () => {
    const { spans } = await started()
    telemetry!.beginRequest('GET', '/api/tracks/nope')!.finish(404)
    await telemetry!.flush()

    expect(spans.getFinishedSpans()[0]?.status.code).toBe(0)
  })
})

describe('job spans', () => {
  const JOB = { id: 'j1', type: 'import', targetId: 't1' }

  test('a Job is a span named for its type, carrying its id and target', async () => {
    const { spans } = await started()
    telemetry!.beginJob(JOB, null)!.finish()
    await telemetry!.flush()

    const [span] = spans.getFinishedSpans()
    expect(span?.name).toBe('job import')
    expect(span?.attributes['akapela.job.id']).toBe('j1')
    expect(span?.attributes['akapela.job.type']).toBe('import')
    expect(span?.attributes['akapela.job.target_id']).toBe('t1')
  })

  test('omits the target attribute for a Job with none', async () => {
    const { spans } = await started()
    telemetry!.beginJob({ id: 'j1', type: 'noop', targetId: null }, null)!.finish()
    await telemetry!.flush()

    expect('akapela.job.target_id' in spans.getFinishedSpans()[0]!.attributes).toBe(false)
  })

  test('joins the trace named by its traceparent rather than starting a lonely one', async () => {
    const { spans } = await started()
    const request = telemetry!.beginRequest('POST', '/api/tracks')!
    const { traceParent } = request
    request.finish(201)

    telemetry!.beginJob(JOB, traceParent)!.finish()
    await telemetry!.flush()

    const [requestSpan, jobSpan] = spans.getFinishedSpans()
    expect(jobSpan?.spanContext().traceId).toBe(requestSpan?.spanContext().traceId)
    expect(jobSpan?.parentSpanContext?.spanId).toBe(requestSpan?.spanContext().spanId)
  })

  test('still opens a span, just not a child of anything, when there is no traceparent', async () => {
    const { spans } = await started()
    telemetry!.beginJob(JOB, null)!.finish()
    await telemetry!.flush()

    expect(spans.getFinishedSpans()[0]?.parentSpanContext).toBeUndefined()
  })

  test('a failed Job is an error span carrying what went wrong', async () => {
    const { spans } = await started()
    const span = telemetry!.beginJob(JOB, null)!
    span.failed(new Error('yt-dlp exploded'))
    span.finish()
    await telemetry!.flush()

    const [finished] = spans.getFinishedSpans()
    expect(finished?.status.code).toBe(2)
    expect(finished?.events.some(event => event.name === 'exception')).toBe(true)
  })
})

describe('browser logs', () => {
  test('a console error becomes a log record at error severity', async () => {
    const { logs } = await started()
    telemetry!.recordBrowserLogs([{
      level: 'error',
      message: 'getUserMedia failed',
      at: 1788630000000,
      page: '/tracks/abc/sing',
      stack: 'at record (sing.vue:12)',
    }])
    await telemetry!.flush()

    const [record] = logs.getFinishedLogRecords()
    expect(record?.body).toBe('getUserMedia failed')
    expect(record?.severityText).toBe('error')
    expect(record?.attributes['url.path']).toBe('/tracks/abc/sing')
    expect(record?.attributes['exception.stacktrace']).toBe('at record (sing.vue:12)')
  })

  test('the record says it came from the browser, not from the server', async () => {
    const { logs } = await started()
    telemetry!.recordBrowserLogs([{ level: 'warn', message: 'slow frame', at: null, page: null, stack: null }])
    await telemetry!.flush()

    const [record] = logs.getFinishedLogRecords()
    expect(record?.severityText).toBe('warn')
    expect(record?.attributes['akapela.origin']).toBe('browser')
  })
})
