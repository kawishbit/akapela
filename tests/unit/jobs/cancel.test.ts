import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeSineWav } from '../audio-fixtures'
import { createJobTestDb, type JobTestDb } from '../job-test-db'
import type { JobType } from '../../../server/db/schema'
import { cancelJob } from '../../../server/lib/job-actions'
import { getJob } from '../../../server/lib/jobs'
import { JobsRunner, type Handler } from '../../../server/lib/jobs-runner'
import { importHandler } from '../../../server/lib/jobs/import-track'
import { runRender } from '../../../server/lib/jobs/render'
import { separateHandler, type Separator, type Stems } from '../../../server/lib/jobs/separate'
import type { MetadataOptions, ProgressCallback, SourceFetcher, SourceMetadata } from '../../../server/lib/sources'
import { killOnAbort } from '../../../server/lib/tools'

/**
 * Cancelling a Job while its Lane is running it: the runner hands the handler
 * an `AbortSignal`, the cancel route aborts it, and whatever the handler was
 * doing goes back the way it was before the Job was asked for.
 */

const TRACK_ID = 't1'

let db: JobTestDb | undefined

afterEach(() => {
  db?.close()
  db = undefined
})

function setup(): JobTestDb {
  db = createJobTestDb()
  return db
}

function trackDir(t: JobTestDb): string {
  return join(t.dataDir, 'tracks', TRACK_ID)
}

function insertTrack(t: JobTestDb, state: { importState: string, separationState: string, backingSource?: string }): void {
  t.akapela.sqlite
    .prepare(
      `INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind, source_ref,
        import_state, separation_state, backing_source, created_at, updated_at)
       VALUES (?, 'Sine Song', NULL, 2000, 'cover.svg', 'youtube', 'https://youtu.be/x', ?, ?, ?, 1000, 1000)`,
    )
    .run(TRACK_ID, state.importState, state.separationState, state.backingSource ?? 'original')
}

function trackRow(t: JobTestDb): Record<string, unknown> | undefined {
  return t.akapela.sqlite.prepare(`SELECT * FROM tracks WHERE id = ?`).get(TRACK_ID) as Record<string, unknown> | undefined
}

/** Resolves once the job row says the Lane has claimed it. */
async function untilRunning(t: JobTestDb, jobId: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (t.getJob(jobId).state === 'running') return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`${jobId} never started`)
}

/** Waits for the signal, the way a handler whose subprocess is killed does, then rejects. */
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new Error('aborted'))
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
}

function runnerFor(t: JobTestDb, handlers: Partial<Record<JobType, Handler>>): JobsRunner {
  return new JobsRunner(t.akapela.sqlite, t.dataDir, { handlers, running: t.akapela.runningJobs })
}

async function cancelRunning(t: JobTestDb, jobId: string) {
  return cancelJob(t.akapela, getJob(t.akapela, jobId)!)
}

describe('cancelling a running Job', () => {
  it('ends the row cancelled with no error, never failed, and frees the Lane for the next Job', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    t.enqueue('noop', { id: 'j2', createdAt: 2000 })
    const ran: string[] = []
    const runner = runnerFor(t, {
      noop: async (ctx) => {
        ran.push(ctx.job.id)
        if (ctx.job.id === 'j1') await untilAborted(ctx.signal)
      },
    })

    const first = runner.runOnce()
    await untilRunning(t, 'j1')
    await cancelRunning(t, 'j1')
    await first

    const job = t.getJob('j1')
    expect(job.state).toBe('cancelled')
    expect(job.error).toBeNull()
    await runner.runOnce()
    expect(ran).toEqual(['j1', 'j2'])
    expect(t.getJob('j2').state).toBe('succeeded')
  })

  it('does not abort a running Job on shutdown, which only stops the loop between Jobs', async () => {
    const t = setup()
    t.enqueue('noop', { id: 'j1', createdAt: 1000 })
    let sawAbort: boolean | undefined
    const runner = runnerFor(t, {
      noop: async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 50))
        sawAbort = ctx.signal.aborted
      },
    })
    const stopping = new AbortController()

    const loop = runner.runForever(5, stopping.signal)
    await untilRunning(t, 'j1')
    stopping.abort()
    await loop

    expect(sawAbort).toBe(false)
    expect(t.getJob('j1').state).toBe('succeeded')
  })
})

/** Hangs in the model run until it is aborted, which is where a real Separation spends its minutes. */
class HangingSeparator implements Separator {
  async fetchModel(): Promise<void> {}
  async separate(_backing: string, _models: string, options: { signal?: AbortSignal } = {}): Promise<Stems> {
    return untilAborted(options.signal!)
  }
}

describe('cancelling a running Separation', () => {
  it('leaves a re-separated Track ready, on its previous Stems byte for byte', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    writeFileSync(join(dir, 'instrumental.wav'), 'the old instrumental')
    writeFileSync(join(dir, 'vocals.wav'), 'the old vocals')
    insertTrack(t, { importState: 'ready', separationState: 'separating', backingSource: 'instrumental' })
    t.enqueue('separate', { id: 'j1', createdAt: 1000, targetId: TRACK_ID })
    const runner = runnerFor(t, { separate: separateHandler(new HangingSeparator()) })

    const running = runner.runOnce()
    await untilRunning(t, 'j1')
    await cancelRunning(t, 'j1')
    await running

    expect(t.getJob('j1').state).toBe('cancelled')
    expect(trackRow(t)).toMatchObject({ separation_state: 'ready', backing_source: 'instrumental' })
    expect(readFileSync(join(dir, 'instrumental.wav'), 'utf8')).toBe('the old instrumental')
    expect(readFileSync(join(dir, 'vocals.wav'), 'utf8')).toBe('the old vocals')
    expect(existsSync(join(dir, 'stems.part'))).toBe(false)
  })

  it('leaves a first Separation with no Stems and nothing partial on disk', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t, { importState: 'ready', separationState: 'separating' })
    t.enqueue('separate', { id: 'j1', createdAt: 1000, targetId: TRACK_ID })
    const runner = runnerFor(t, { separate: separateHandler(new HangingSeparator()) })

    const running = runner.runOnce()
    await untilRunning(t, 'j1')
    await cancelRunning(t, 'j1')
    await running

    expect(trackRow(t)).toMatchObject({ separation_state: 'none', backing_source: 'original' })
    expect(readdirSync(dir).sort()).toEqual(['backing.wav'])
  })
})

/** Hangs in the download until it is aborted. */
class HangingFetcher implements SourceFetcher {
  async fetchMetadata(_url: string, _directory: string, _options?: MetadataOptions): Promise<SourceMetadata> {
    return { title: 'Sine', durationMs: 2000, coverFile: null }
  }

  async downloadAudio(_url: string, directory: string, _onProgress: ProgressCallback, signal?: AbortSignal): Promise<string> {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'original.webm.part'), 'half a download')
    return untilAborted(signal!)
  }
}

describe('cancelling a running import', () => {
  it('leaves no Track and no directory behind', async () => {
    const t = setup()
    mkdirSync(trackDir(t), { recursive: true })
    insertTrack(t, { importState: 'importing', separationState: 'none' })
    t.enqueue('import', { id: 'j1', createdAt: 1000, targetId: TRACK_ID })
    const runner = runnerFor(t, { import: importHandler(new HangingFetcher()) })

    const running = runner.runOnce()
    await untilRunning(t, 'j1')
    await cancelRunning(t, 'j1')
    await running

    expect(trackRow(t)).toBeUndefined()
    expect(existsSync(trackDir(t))).toBe(false)
    expect(t.getJob('j1').state).toBe('cancelled')
  })
})

describe('cancelling a running Mix', () => {
  it('leaves no Mix row and no partial file', async () => {
    const t = setup()
    const dir = trackDir(t)
    // Long enough, and stretched, that the render is still going when it is cancelled.
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 60 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t, { importState: 'ready', separationState: 'none' })
    t.akapela.sqlite
      .prepare(
        `INSERT INTO takes (id, track_id, start_position_ms, duration_ms, file_path, adjustments,
          latency_nudge_ms, vocal_gain, backing_gain, created_at, updated_at)
         VALUES ('k1', ?, 0, 1000, 'takes/take1.wav', ?, 0, 1, 1, 1000, 1000)`,
      )
      .run(TRACK_ID, JSON.stringify({ pitchSemitones: 0, tempoPercent: 80, linked: false }))
    t.akapela.sqlite
      .prepare(
        `INSERT INTO mixes (id, take_id, wav_requested, pitch_semitones, tempo_percent, linked,
          latency_nudge_ms, vocal_gain, backing_gain, job_id, created_at, updated_at)
         VALUES ('m1', 'k1', 1, 2, 80, 0, 0, 1, 1, 'j1', 1000, 1000)`,
      )
      .run()
    t.enqueue('render', { id: 'j1', createdAt: 1000, targetId: 'm1' })
    const runner = runnerFor(t, { render: runRender })

    const running = runner.runOnce()
    await untilRunning(t, 'j1')
    await new Promise(resolve => setTimeout(resolve, 100))
    await cancelRunning(t, 'j1')
    await running

    expect(t.getJob('j1').state).toBe('cancelled')
    expect(t.akapela.sqlite.prepare(`SELECT 1 FROM mixes WHERE id = 'm1'`).get()).toBeUndefined()
    const mixesDir = join(dir, 'mixes')
    expect(existsSync(mixesDir) ? readdirSync(mixesDir) : []).toEqual([])
  }, 30_000)
})

describe('killOnAbort', () => {
  it('leaves no subprocess burning CPU once the signal aborts', async () => {
    const controller = new AbortController()
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    killOnAbort(child, controller.signal)
    const exited = new Promise(resolve => child.on('close', resolve))

    controller.abort()
    await exited

    expect(isAlive(child.pid!)).toBe(false)
  })
})

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}
