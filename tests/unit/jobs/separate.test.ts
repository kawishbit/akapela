import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeWav } from '../../../app/audio/wav'
import { probe, writeSineWav } from '../audio-fixtures'
import { createJobTestDb, type JobTestDb } from '../job-test-db'
import { separateHandler, type Separator, type Stems } from '../../../server/lib/jobs/separate'
import { JobsRunner } from '../../../server/lib/jobs-runner'

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

function trackDir(t: JobTestDb, trackId = TRACK_ID): string {
  return join(t.dataDir, 'tracks', trackId)
}

function insertTrack(t: JobTestDb): void {
  t.akapela.sqlite
    .prepare(
      `INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind, source_ref,
        import_state, separation_state, created_at, updated_at)
       VALUES (?, 'Sine Song', NULL, 2000, 'cover.svg', 'upload', 'sine.wav', 'ready', 'separating', 1000, 1000)`,
    )
    .run(TRACK_ID)
}

function enqueueSeparate(t: JobTestDb, jobId = 'j1'): void {
  t.akapela.sqlite
    .prepare(`INSERT INTO jobs (id, type, target_id, state, progress, error, created_at) VALUES (?, 'separate', ?, 'queued', 0, NULL, 1000)`)
    .run(jobId, TRACK_ID)
}

function getJob(t: JobTestDb, jobId: string): Record<string, unknown> {
  return t.akapela.sqlite.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as Record<string, unknown>
}

function separationState(t: JobTestDb): string | null {
  const row = t.akapela.sqlite.prepare(`SELECT separation_state FROM tracks WHERE id = ?`).get(TRACK_ID) as
    { separation_state: string } | undefined
  return row?.separation_state ?? null
}

function backingSource(t: JobTestDb): string | null {
  const row = t.akapela.sqlite.prepare(`SELECT backing_source FROM tracks WHERE id = ?`).get(TRACK_ID) as
    { backing_source: string } | undefined
  return row?.backing_source ?? null
}

/** Stands in for the model: writes deterministic Stems without going near ONNX. */
class FakeSeparator implements Separator {
  modelsDirs: string[] = []
  separated: string[] = []

  constructor(private readonly options: {
    fetchError?: string
    separateError?: string
    duringSeparation?: () => void
  } = {}) {}

  async fetchModel(modelsDir: string): Promise<void> {
    if (this.options.fetchError) throw new Error(this.options.fetchError)
    this.modelsDirs.push(modelsDir)
    const model = join(modelsDir, 'fake-model.onnx')
    if (existsSync(model)) return
    mkdirSync(modelsDir, { recursive: true })
    writeFileSync(model, 'not a model')
  }

  async separate(backingPath: string): Promise<Stems> {
    if (this.options.separateError) throw new Error(this.options.separateError)
    this.separated.push(backingPath)
    const { channels, sampleRate } = decodeWav(await readFile(backingPath))
    const length = channels[0]!.length
    const instrumental: [Float64Array, Float64Array] = [new Float64Array(length), new Float64Array(length)]
    const vocals: [Float64Array, Float64Array] = [new Float64Array(length), new Float64Array(length)]
    for (let i = 0; i < length; i++) {
      instrumental[0][i] = 0.1 * Math.sin((2 * Math.PI * 220 * i) / sampleRate)
      instrumental[1][i] = instrumental[0][i]!
      vocals[0][i] = 0.1 * Math.sin((2 * Math.PI * 880 * i) / sampleRate)
      vocals[1][i] = vocals[0][i]!
    }
    // The model run is the minutes-long window a Track can be deleted in.
    this.options.duringSeparation?.()
    return { instrumental, vocals, sampleRate }
  }
}

function runTheJob(t: JobTestDb, separator: FakeSeparator): Promise<boolean> {
  return new JobsRunner(t.akapela.sqlite, t.dataDir, { handlers: { separate: separateHandler(separator) } }).runOnce()
}

describe('separateHandler', () => {
  it('writes both Stems beside an untouched Backing Track', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    const backingBefore = await readFile(join(dir, 'backing.wav'))
    insertTrack(t)
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator())

    const job = getJob(t, 'j1')
    expect(job.state).toBe('succeeded')
    for (const name of ['instrumental.wav', 'vocals.wav']) {
      const stem = join(dir, name)
      expect(existsSync(stem)).toBe(true)
      const info = probe(stem)
      expect(info.streams[0]!.codec_name).toBe('pcm_s16le')
      expect(info.streams[0]!.sample_rate).toBe('44100')
      expect(info.streams[0]!.channels).toBe(2)
    }
    expect(await readFile(join(dir, 'backing.wav'))).toEqual(backingBefore)
  })

  it('fetches the model into the data directory and reuses it next time', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t)
    const separator = new FakeSeparator()

    enqueueSeparate(t, 'j1')
    await runTheJob(t, separator)
    const modelPath = join(t.dataDir, 'cache', 'models', 'fake-model.onnx')
    expect(existsSync(modelPath)).toBe(true)

    enqueueSeparate(t, 'j2')
    await runTheJob(t, separator)

    expect(getJob(t, 'j2').state).toBe('succeeded')
    expect(separator.modelsDirs).toEqual([join(t.dataDir, 'cache', 'models'), join(t.dataDir, 'cache', 'models')])
  })

  it('reports its coarse steps on the job row', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t)
    enqueueSeparate(t)

    const reported: number[] = []
    const separator = new FakeSeparator()
    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir, {
      handlers: {
        separate: async (ctx) => {
          const wrapped = { ...ctx, progress: (p: number) => { reported.push(p); ctx.progress(p) } }
          await separateHandler(separator)(wrapped)
        },
      },
    })

    await runner.runOnce()

    expect(reported).toEqual([10, 30, 85])
    expect(getJob(t, 'j1').progress).toBe(100)
  })

  it('overwrites both Stems in place on re-separation', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    writeFileSync(join(dir, 'instrumental.wav'), 'stale stem from an older model')
    writeFileSync(join(dir, 'vocals.wav'), 'stale stem from an older model')
    insertTrack(t)
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator())

    expect(getJob(t, 'j1').state).toBe('succeeded')
    for (const name of ['instrumental.wav', 'vocals.wav']) {
      expect(probe(join(dir, name)).streams[0]!.sample_rate).toBe('44100')
    }
    expect(readdirSync(dir).filter(f => f.endsWith('.wav')).sort()).toEqual(['backing.wav', 'instrumental.wav', 'vocals.wav'])
    expect(existsSync(join(dir, 'stems.part'))).toBe(false)
  })

  it('records why on the job and writes no Stems when the model download fails', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t)
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator({ fetchError: 'could not download the separation model: no network' }))

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('no network')
    expect(existsSync(join(dir, 'instrumental.wav'))).toBe(false)
    expect(existsSync(join(dir, 'vocals.wav'))).toBe(false)
  })

  it('records the error and leaves earlier Stems alone on a failed separation', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    writeSineWav(join(dir, 'instrumental.wav'), { frequency: 110 })
    const kept = await readFile(join(dir, 'instrumental.wav'))
    insertTrack(t)
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator({ separateError: 'the model refused this audio' }))

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('the model refused this audio')
    expect(await readFile(join(dir, 'instrumental.wav'))).toEqual(kept)
  })

  it('fails the job when the Track is missing', async () => {
    const t = setup()
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator())

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain(TRACK_ID)
  })

  it('leaves no orphan directory when the Track is deleted while the model runs', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t)
    enqueueSeparate(t)

    const separator = new FakeSeparator({
      duringSeparation: () => {
        t.akapela.sqlite.prepare(`DELETE FROM tracks WHERE id = ?`).run(TRACK_ID)
      },
    })

    await runTheJob(t, separator)

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('deleted during separation')
    expect(existsSync(dir)).toBe(false)
  })

  it('leaves the Track ready and on its Instrumental Stem on success', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t)
    enqueueSeparate(t)
    expect(backingSource(t)).toBe('original')

    await runTheJob(t, new FakeSeparator())

    expect(separationState(t)).toBe('ready')
    expect(backingSource(t)).toBe('instrumental')
  })

  it('leaves the Track on its current audio when separation fails', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { seconds: 1 })
    insertTrack(t)
    t.akapela.sqlite.prepare(`UPDATE tracks SET backing_source = 'original' WHERE id = ?`).run(TRACK_ID)
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator({ separateError: 'the model refused this audio' }))

    expect(backingSource(t)).toBe('original')
    expect(separationState(t)).toBe('failed')
  })

  it('fails rather than sticking at "separating" when the Backing Track is missing', async () => {
    const t = setup()
    mkdirSync(trackDir(t), { recursive: true })
    insertTrack(t)
    enqueueSeparate(t)

    await runTheJob(t, new FakeSeparator())

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(separationState(t)).toBe('failed')
  })
})
