import { afterEach, describe, expect, it } from 'vitest'
import { JobsRunner, type Handler } from '../../server/lib/jobs-runner'
import { createJobTestDb, type JobTestDb } from './job-test-db'

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
})
