import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendEffects } from '../../../server/lib/audio'
import { JobsRunner } from '../../../server/lib/jobs-runner'
import { runRender } from '../../../server/lib/jobs/render'
import type { JobContext } from '../../../server/lib/jobs-runner'
import { probe, writeBurstThenSilenceWav, writeSineWav } from '../audio-fixtures'
import { createJobTestDb, type JobTestDb } from '../job-test-db'
import { rmsWindow } from '../wav-rms'

const TRACK_ID = 't1'
const TAKE_ID = 'take1'

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

function insertTrack(t: JobTestDb, trackId = TRACK_ID): void {
  t.akapela.sqlite
    .prepare(
      `INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind, source_ref,
        import_state, created_at, updated_at)
       VALUES (?, 'Sine Song', NULL, NULL, 'cover.svg', 'upload', 'sine.wav', 'ready', 1000, 1000)`,
    )
    .run(trackId)
}

function insertTake(
  t: JobTestDb,
  options: {
    takeId?: string
    trackId?: string
    filePath: string
    startPositionMs: number
    durationMs: number
    tempoPercent?: number
  },
): void {
  const adjustments = JSON.stringify({ pitchSemitones: 0, tempoPercent: options.tempoPercent ?? 100, linked: false })
  t.akapela.sqlite
    .prepare(
      `INSERT INTO takes (id, track_id, start_position_ms, duration_ms, file_path, adjustments,
        latency_nudge_ms, vocal_gain, backing_gain, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 1000, 1000)`,
    )
    .run(
      options.takeId ?? TAKE_ID, options.trackId ?? TRACK_ID, options.startPositionMs,
      options.durationMs, options.filePath, adjustments,
    )
}

interface InsertMixOptions {
  mixId: string
  takeId?: string
  jobId: string
  tempoPercent?: number
  pitchSemitones?: number
  linked?: boolean
  reverbAmount?: number
  lowpassHz?: number
  effectsTarget?: string
  backingSource?: string
  latencyNudgeMs?: number
  vocalGain?: number
  backingGain?: number
  wavRequested?: boolean
}

function insertMix(t: JobTestDb, options: InsertMixOptions): void {
  t.akapela.sqlite
    .prepare(
      `INSERT INTO mixes (id, take_id, mp3_path, wav_path, wav_requested, pitch_semitones,
        tempo_percent, linked, reverb_amount, lowpass_hz, effects_target, backing_source,
        latency_nudge_ms, vocal_gain, backing_gain, job_id, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, 1000)`,
    )
    .run(
      options.mixId, options.takeId ?? TAKE_ID, options.wavRequested ? 1 : 0,
      options.pitchSemitones ?? 0, options.tempoPercent ?? 100, options.linked ? 1 : 0,
      options.reverbAmount ?? 0, options.lowpassHz ?? 20000, options.effectsTarget ?? 'backing',
      options.backingSource ?? 'original', options.latencyNudgeMs ?? 0,
      options.vocalGain ?? 1.0, options.backingGain ?? 1.0, options.jobId,
    )
}

function enqueueRender(t: JobTestDb, mixId: string, jobId = 'j1'): void {
  t.akapela.sqlite
    .prepare(`INSERT INTO jobs (id, type, target_id, state, progress, error, created_at) VALUES (?, 'render', ?, 'queued', 0, NULL, 1000)`)
    .run(jobId, mixId)
}

function getJob(t: JobTestDb, jobId: string): Record<string, unknown> {
  return t.akapela.sqlite.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as Record<string, unknown>
}

function getMix(t: JobTestDb, mixId = 'm1'): Record<string, unknown> {
  return t.akapela.sqlite.prepare(`SELECT * FROM mixes WHERE id = ?`).get(mixId) as Record<string, unknown>
}

describe('runRender', () => {
  it('covers the full Backing Track with vocal energy at the start position', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 4 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 1000, durationMs: 1000 })
    insertMix(t, { mixId: 'm1', jobId: 'j1' })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    const job = getJob(t, 'j1')
    expect(job.state).toBe('succeeded')
    const mix = getMix(t)
    expect(mix.mp3_path).toBe('mixes/m1.mp3')
    expect(mix.wav_path).toBeNull()

    const mp3 = join(dir, 'mixes', 'm1.mp3')
    expect(existsSync(mp3)).toBe(true)
    expect(Math.abs(Number(probe(mp3).format.duration) - 4)).toBeLessThan(0.2)
    expect(existsSync(join(dir, 'mixes', 'm1.wav'))).toBe(false)
  })

  it('places a requested WAV’s vocal energy at start position plus nudge', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 4 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 1000, durationMs: 1000 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', latencyNudgeMs: 200, wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    const wav = join(dir, 'mixes', 'm1.wav')
    expect(existsSync(wav)).toBe(true)

    const baseline = rmsWindow(wav, 0.0, 0.9)
    const duringVocal = rmsWindow(wav, 1.5, 1.9)
    const afterVocal = rmsWindow(wav, 2.5, 3.5)
    expect(duringVocal).toBeGreaterThan(baseline * 1.2)
    expect(afterVocal).toBeLessThan(duringVocal)
  })

  it('shrinks both the Mix and the vocal placement at a faster tempo', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 4 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 1000, durationMs: 1000, tempoPercent: 200 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', tempoPercent: 200, wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    const wav = join(dir, 'mixes', 'm1.wav')
    expect(Math.abs(Number(probe(wav).format.duration) - 2)).toBeLessThan(0.05)

    const baseline = rmsWindow(wav, 0.0, 0.4)
    const duringVocal = rmsWindow(wav, 0.6, 0.9)
    expect(duringVocal).toBeGreaterThan(baseline * 1.2)
  })

  it('trims the vocal instead of going negative on a large negative nudge', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 4 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 300, durationMs: 1000 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', latencyNudgeMs: -500, wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    const wav = join(dir, 'mixes', 'm1.wav')
    expect(Math.abs(Number(probe(wav).format.duration) - 4)).toBeLessThan(0.05)
    expect(rmsWindow(wav, 0.0, 0.7)).toBeGreaterThan(rmsWindow(wav, 1.5, 2.5) * 1.2)
  })

  it('changes the relative level of the vocal with vocal gain', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 3 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 1000, durationMs: 1000 })
    insertMix(t, { mixId: 'quiet', jobId: 'j1', vocalGain: 0.1, backingGain: 0.0, wavRequested: true })
    insertMix(t, { mixId: 'loud', jobId: 'j2', vocalGain: 1.8, backingGain: 0.0, wavRequested: true })
    enqueueRender(t, 'quiet', 'j1')
    enqueueRender(t, 'loud', 'j2')

    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await runner.runOnce()
    await runner.runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(getJob(t, 'j2').state).toBe('succeeded')
    const quietRms = rmsWindow(join(dir, 'mixes', 'quiet.wav'), 1.2, 1.8)
    const loudRms = rmsWindow(join(dir, 'mixes', 'loud.wav'), 1.2, 1.8)
    expect(loudRms).toBeGreaterThan(quietRms * 3)
  })

  it('changes the relative level of the backing with backing gain', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 3 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 1000, durationMs: 1000 })
    insertMix(t, { mixId: 'quiet', jobId: 'j1', vocalGain: 0.0, backingGain: 0.2, wavRequested: true })
    insertMix(t, { mixId: 'loud', jobId: 'j2', vocalGain: 0.0, backingGain: 1.6, wavRequested: true })
    enqueueRender(t, 'quiet', 'j1')
    enqueueRender(t, 'loud', 'j2')

    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await runner.runOnce()
    await runner.runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(getJob(t, 'j2').state).toBe('succeeded')
    const quietRms = rmsWindow(join(dir, 'mixes', 'quiet.wav'), 0.0, 0.5)
    const loudRms = rmsWindow(join(dir, 'mixes', 'loud.wav'), 0.0, 0.5)
    expect(loudRms).toBeGreaterThan(quietRms * 3)
  })

  it('fails the job when the target Mix does not exist', async () => {
    const t = setup()
    enqueueRender(t, 'nope', 'j1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('nope')
  })

  it('leaves no orphan files when the Mix is deleted during render', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 1 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.5 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 0, durationMs: 500 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', wavRequested: true })
    t.akapela.sqlite.prepare(`INSERT INTO jobs (id, type, target_id, state, progress, error, created_at) VALUES ('j1', 'render', 'm1', 'running', 0, NULL, 1000)`).run()

    const ctx: JobContext = {
      job: { id: 'j1', type: 'render', targetId: 'm1', state: 'running', progress: 0, error: null, createdAt: 1000, startedAt: 1000, finishedAt: null, traceParent: null },
      dataDir: t.dataDir,
      sqlite: t.akapela.sqlite,
      progress(percent) {
        t.akapela.sqlite.prepare(`UPDATE jobs SET progress = ? WHERE id = 'j1'`).run(percent)
        if (percent === 80) t.akapela.sqlite.prepare(`DELETE FROM mixes WHERE id = 'm1'`).run()
      },
    }

    await expect(runRender(ctx)).rejects.toThrow(/deleted/)
    expect(existsSync(join(dir, 'mixes', 'm1.mp3'))).toBe(false)
    expect(existsSync(join(dir, 'mixes', 'm1.wav'))).toBe(false)
  })

  it('records the error on the job when the Take recording is missing', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 2 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/missing.wav', startPositionMs: 0, durationMs: 1000 })
    insertMix(t, { mixId: 'm1', jobId: 'j1' })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('failed')
    expect(getMix(t).mp3_path).toBeNull()
    expect(existsSync(join(dir, 'mixes', 'm1.mp3'))).toBe(false)
  })

  it('reports progress before finishing', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 1 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.5 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 0, durationMs: 500 })
    insertMix(t, { mixId: 'm1', jobId: 'j1' })
    t.akapela.sqlite.prepare(`INSERT INTO jobs (id, type, target_id, state, progress, error, created_at) VALUES ('j1', 'render', 'm1', 'running', 0, NULL, 1000)`).run()

    const seen: number[] = []
    const ctx: JobContext = {
      job: { id: 'j1', type: 'render', targetId: 'm1', state: 'running', progress: 0, error: null, createdAt: 1000, startedAt: 1000, finishedAt: null, traceParent: null },
      dataDir: t.dataDir,
      sqlite: t.akapela.sqlite,
      progress(percent) {
        seen.push(percent)
        t.akapela.sqlite.prepare(`UPDATE jobs SET progress = ? WHERE id = 'j1'`).run(percent)
      },
    }

    await runRender(ctx)

    expect(seen[0]).toBeLessThan(100)
    expect(seen.some(p => p > 0 && p < 100)).toBe(true)
  })

  it('raises energy in the reverb tail after the last input sample', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeBurstThenSilenceWav(join(dir, 'backing.wav'), { frequency: 220, burstSeconds: 0.3, totalSeconds: 3 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 2900, durationMs: 100 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', reverbAmount: 65, wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(rmsWindow(join(dir, 'mixes', 'm1.wav'), 0.5, 1.0)).toBeGreaterThan(0)
  })

  it('leaves the tail silent with no reverb', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeBurstThenSilenceWav(join(dir, 'backing.wav'), { frequency: 220, burstSeconds: 0.3, totalSeconds: 3 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 2900, durationMs: 100 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', reverbAmount: 0, wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(rmsWindow(join(dir, 'mixes', 'm1.wav'), 0.5, 1.0)).toBe(0)
  })

  it('measurably reduces high-frequency energy with the low pass', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 8000, seconds: 2 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 1900, durationMs: 100 })
    insertMix(t, { mixId: 'filtered', jobId: 'j1', lowpassHz: 1000, wavRequested: true })
    insertMix(t, { mixId: 'unfiltered', jobId: 'j2', lowpassHz: 20000, wavRequested: true })
    enqueueRender(t, 'filtered', 'j1')
    enqueueRender(t, 'unfiltered', 'j2')

    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await runner.runOnce()
    await runner.runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(getJob(t, 'j2').state).toBe('succeeded')
    const filteredRms = rmsWindow(join(dir, 'mixes', 'filtered.wav'), 0.2, 1.5)
    const unfilteredRms = rmsWindow(join(dir, 'mixes', 'unfiltered.wav'), 0.2, 1.5)
    expect(filteredRms).toBeLessThan(unfilteredRms * 0.5)
  })

  it('produces identical output for implicit and explicit bypassed defaults', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 2 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.5 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 500, durationMs: 500 })
    insertMix(t, { mixId: 'implicit', jobId: 'j1', wavRequested: true })
    insertMix(t, { mixId: 'explicit', jobId: 'j2', reverbAmount: 0, lowpassHz: 20000, wavRequested: true })
    enqueueRender(t, 'implicit', 'j1')
    enqueueRender(t, 'explicit', 'j2')

    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await runner.runOnce()
    await runner.runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(getJob(t, 'j2').state).toBe('succeeded')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'mixes', 'implicit.wav'))).toEqual(readFileSync(join(dir, 'mixes', 'explicit.wav')))
  })

  it('renders against its own Backing Source even if the Track has moved on', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 2 })
    writeSineWav(join(dir, 'instrumental.wav'), { frequency: 330, seconds: 2 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.5 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 500, durationMs: 500 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', backingSource: 'instrumental', wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    const job = getJob(t, 'j1')
    expect(job.state).toBe('succeeded')
    expect(existsSync(join(dir, 'mixes', 'm1.wav'))).toBe(true)
  })

  it('fails with a message naming the Instrumental Stem when it has been deleted', async () => {
    const t = setup()
    const dir = trackDir(t)
    writeSineWav(join(dir, 'backing.wav'), { frequency: 220, seconds: 2 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, seconds: 0.5 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 500, durationMs: 500 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', backingSource: 'instrumental' })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    const job = getJob(t, 'j1')
    expect(job.state).toBe('failed')
    expect(job.error).toContain('instrumental')
    expect(existsSync(join(dir, 'mixes', 'm1.mp3'))).toBe(false)
  })

  function writeEffectsTargetInputs(t: JobTestDb): string {
    const dir = trackDir(t)
    writeBurstThenSilenceWav(join(dir, 'backing.wav'), { frequency: 220, burstSeconds: 0.3, totalSeconds: 4 })
    writeBurstThenSilenceWav(join(dir, 'takes', 'take1.wav'), { frequency: 880, burstSeconds: 0.3, totalSeconds: 1 })
    return dir
  }

  it.each([
    { effectsTarget: 'backing', backingTail: true, vocalTail: false },
    { effectsTarget: 'vocal', backingTail: false, vocalTail: true },
    { effectsTarget: 'both', backingTail: true, vocalTail: true },
    { effectsTarget: 'none', backingTail: false, vocalTail: false },
  ])('effects target $effectsTarget decides which signals get reverb', async ({ effectsTarget, backingTail, vocalTail }) => {
    const t = setup()
    const dir = writeEffectsTargetInputs(t)
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 2000, durationMs: 1000 })
    insertMix(t, { mixId: 'm1', jobId: 'j1', reverbAmount: 65, effectsTarget, wavRequested: true })
    enqueueRender(t, 'm1')

    await new JobsRunner(t.akapela.sqlite, t.dataDir).runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    const wav = join(dir, 'mixes', 'm1.wav')
    expect(rmsWindow(wav, 0.6, 1.2) > 0).toBe(backingTail)
    expect(rmsWindow(wav, 2.6, 3.2) > 0).toBe(vocalTail)
  })

  it.each([
    { effectsTarget: 'backing', backingFiltered: true, vocalFiltered: false },
    { effectsTarget: 'vocal', backingFiltered: false, vocalFiltered: true },
    { effectsTarget: 'both', backingFiltered: true, vocalFiltered: true },
    { effectsTarget: 'none', backingFiltered: false, vocalFiltered: false },
  ])('effects target $effectsTarget decides which signals get the low pass', async ({ effectsTarget, backingFiltered, vocalFiltered }) => {
    const t = setup()
    const dir = trackDir(t)
    writeBurstThenSilenceWav(join(dir, 'backing.wav'), { frequency: 8000, burstSeconds: 0.5, totalSeconds: 4 })
    writeSineWav(join(dir, 'takes', 'take1.wav'), { frequency: 8000, seconds: 1 })
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 2000, durationMs: 1000 })
    insertMix(t, { mixId: 'filtered', jobId: 'j1', lowpassHz: 1000, effectsTarget, wavRequested: true })
    insertMix(t, { mixId: 'dry', jobId: 'j2', lowpassHz: 1000, effectsTarget: 'none', wavRequested: true })
    enqueueRender(t, 'filtered', 'j1')
    enqueueRender(t, 'dry', 'j2')

    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await runner.runOnce()
    await runner.runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(getJob(t, 'j2').state).toBe('succeeded')
    const filtered = join(dir, 'mixes', 'filtered.wav')
    const dry = join(dir, 'mixes', 'dry.wav')
    const backingOnly: [number, number] = [0.1, 0.4]
    const vocalOnly: [number, number] = [2.2, 2.9]
    expect(rmsWindow(filtered, ...backingOnly) < rmsWindow(dry, ...backingOnly) * 0.5).toBe(backingFiltered)
    expect(rmsWindow(filtered, ...vocalOnly) < rmsWindow(dry, ...vocalOnly) * 0.5).toBe(vocalFiltered)
  })

  it('renders the default target exactly like backing-only Effects', async () => {
    const t = setup()
    const dir = writeEffectsTargetInputs(t)
    insertTrack(t)
    insertTake(t, { filePath: 'takes/take1.wav', startPositionMs: 2000, durationMs: 1000 })
    insertMix(t, { mixId: 'implicit', jobId: 'j1', reverbAmount: 65, lowpassHz: 4000, wavRequested: true })
    insertMix(t, { mixId: 'explicit', jobId: 'j2', reverbAmount: 65, lowpassHz: 4000, effectsTarget: 'backing', wavRequested: true })
    enqueueRender(t, 'implicit', 'j1')
    enqueueRender(t, 'explicit', 'j2')

    const runner = new JobsRunner(t.akapela.sqlite, t.dataDir)
    await runner.runOnce()
    await runner.runOnce()

    expect(getJob(t, 'j1').state).toBe('succeeded')
    expect(getJob(t, 'j2').state).toBe('succeeded')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'mixes', 'implicit.wav'))).toEqual(readFileSync(join(dir, 'mixes', 'explicit.wav')))
  })
})

describe('appendEffects', () => {
  it('leaves the filter graph untouched at bypassed values', () => {
    const segments = ['[0:a]rubberband=tempo=1.0:pitch=1.0[stretched]']

    const label = appendEffects(segments, {
      label: 'stretched', prefix: 'bg', reverbAmount: 0, lowpassHz: 20000, impulseLabel: '[2:a]',
    })

    expect(label).toBe('stretched')
    expect(segments).toEqual(['[0:a]rubberband=tempo=1.0:pitch=1.0[stretched]'])
  })

  it('builds reverb first, then the low pass, and hands on the labels', () => {
    const segments: string[] = []

    const label = appendEffects(segments, {
      label: 'voc', prefix: 'voc', reverbAmount: 65, lowpassHz: 4000, impulseLabel: '[ir_voc]',
    })

    expect(label).toBe('voc_lp')
    expect(segments).toEqual([
      '[voc]asplit=2[voc_dry][voc_wet_in]',
      '[voc_wet_in][ir_voc]afir=dry=1:wet=1[voc_wet]',
      '[voc_dry][voc_wet]amix=inputs=2:weights=0.350000 0.650000:normalize=0[voc_reverbed]',
      '[voc_reverbed]lowpass=f=4000[voc_lp]',
    ])
  })
})
