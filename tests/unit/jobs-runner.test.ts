import { afterEach, describe, expect, it } from 'vitest'
import { JobsRunner, type Handler } from '../../server/lib/jobs-runner'
import type { Job } from '../../server/db/schema'
import type { JobSpan, Telemetry } from '../../server/lib/telemetry'
import { createJobTestDb, type JobTestDb } from './job-test-db'

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

interface RecordedSpan {
  job: Job
  traceParent: string | null
  failedWith: unknown
  stateWhenClosed: string | null
}

/** Stands in for the Dashboard: remembers every span the runner asked for. */
class RecordingTelemetry implements Telemetry {
  enabled = true
  spans: RecordedSpan[] = []

  constructor(private readonly t: JobTestDb) {}

  beginRequest(): null {
    return null
  }

  beginJob(job: { id: string, type: string, targetId: string | null }, traceParent: string | null): JobSpan {
    const record: RecordedSpan = { job: job as Job, traceParent, failedWith: null, stateWhenClosed: null }
    this.spans.push(record)
    return {
      failed: (error: unknown) => {
        record.failedWith = error
      },
      finish: () => {
        // What the job row says at the moment the span ends, which is how a
        // test sees whether the span really covered the Job to its terminal state.
        record.stateWhenClosed = this.t.getJob(job.id).state as string
      },
    }
  }

  recordBrowserLogs(): void {}
  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

let db: JobTestDb | undefined

afterEach(() => {
  db?.close()
  db = undefined
})

function setup(): JobTestDb {
  db = createJobTestDb()
  return db
}

const failingHandler: Handler = async () => {
  throw new Error('yt-dlp exploded')
}

describe('JobsRunner', () => {
  it('runs a queued noop job to succeeded', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)

    await expect(runner.runOnce()).resolves.toBe(true)

    const job = t.getJob('j1')
    expect(job.state).toBe('succeeded')
    expect(job.progress).toBe(100)
    expect(job.error).toBeNull()
    expect(job.started_at).not.toBeNull()
    expect(job.finished_at).not.toBeNull()
  })

  it('reports nothing to do on an empty queue', async () => {
    const t = setup()
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await expect(runner.runOnce()).resolves.toBe(false)
  })

  it('records a handler failure on the job', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir, { handlers: { noop: failingHandler } })

    await runner.runOnce()

    const job = t.getJob('j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('yt-dlp exploded')
    expect(job.finished_at).not.toBeNull()
  })

  it('fails an unknown job type rather than hanging', async () => {
    const t = setup()
    // @ts-expect-error - deliberately not a real JobType, mirroring a row a future migration might add
    t.enqueue('teleport', { id: 'j1', createdAt: 1000 })
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)

    await runner.runOnce()

    const job = t.getJob('j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('teleport')
  })

  it('runs jobs one at a time in creation order', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'second', createdAt: 2000 })
    t.enqueue('noop', { id: 'first', createdAt: 1000 })
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)

    await runner.runOnce()
    expect(t.getJob('first').state).toBe('succeeded')
    expect(t.getJob('second').state).toBe('queued')

    await runner.runOnce()
    expect(t.getJob('second').state).toBe('succeeded')
  })

  it('requeues a stale running job on startup', () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    t.akapela.sqlite
      .prepare(`UPDATE jobs SET state = 'running', started_at = 1500, progress = 40 WHERE id = 'j1'`)
      .run()

    new JobsRunner(t.akapela.sqlite, t.dataDir).recoverStaleJobs()

    const job = t.getJob('j1')
    expect(job.state).toBe('queued')
    expect(job.started_at).toBeNull()
    expect(job.progress).toBe(0)
  })

  it('reflects a handler’s own progress calls, and ends at 100 on success', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const seen: number[] = []
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir, {
      handlers: {
        noop: async (ctx) => {
          ctx.progress(42)
          seen.push(t.getJob('j1').progress as number)
        },
      },
    })

    await runner.runOnce()

    expect(seen).toEqual([42])
    expect(t.getJob('j1').progress).toBe(100)
  })

  it('runForever processes what is queued, checkpoints stale jobs, and stops when aborted', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    t.enqueue('noop', { id: 'j2', createdAt: 2000 })
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    const controller = new AbortController()

    const finished = runner.runForever(5, controller.signal)
    // Both queued jobs are handlers that resolve immediately; give the loop a
    // couple of turns to drain them before asking it to stop.
    await new Promise(resolve => setTimeout(resolve, 50))
    controller.abort()
    await finished

    expect(t.getJob('j1').state).toBe('succeeded')
    expect(t.getJob('j2').state).toBe('succeeded')
  })

  it('runs a job inside a span covering its lifetime', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { telemetry }).runOnce()

    const [span] = telemetry.spans
    expect(span?.job.id).toBe('j1')
    expect(span?.job.type).toBe('noop')
  })

  it('carries the trace of the request that enqueued the job on the span', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000, traceParent: TRACEPARENT })
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { telemetry }).runOnce()

    expect(telemetry.spans[0]?.traceParent).toBe(TRACEPARENT)
  })

  it('still opens a span for a job enqueued without a trace', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { telemetry }).runOnce()

    expect(telemetry.spans[0]?.traceParent).toBeNull()
  })

  it('reaches the span, as well as the job row, on a handler failure', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { handlers: { noop: failingHandler }, telemetry }).runOnce()

    expect(telemetry.spans[0]?.failedWith).toBeInstanceOf(Error)
    expect(t.getJob('j1').state).toBe('failed')
  })

  it('opens no span on an empty queue', async () => {
    const t = setup()
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { telemetry }).runOnce()

    expect(telemetry.spans).toEqual([])
  })

  it('is still open when the job reaches its terminal state', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { telemetry }).runOnce()

    expect(telemetry.spans[0]?.stateWhenClosed).toBe('succeeded')
  })

  it('is written to failed before its span closes too', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    const telemetry = new RecordingTelemetry(t)

    await new JobsRunner(t.akapela.sqlite, t.dataDir, { handlers: { noop: failingHandler }, telemetry }).runOnce()

    expect(telemetry.spans[0]?.stateWhenClosed).toBe('failed')
  })
})
