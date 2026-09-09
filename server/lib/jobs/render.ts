import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { probeDurationMs, renderMix } from '../audio'
import { BACKING_SOURCE_FILES } from '../tracks'
import type { Handler } from '../jobs-runner'
import type { BackingSource } from '../../../shared/backing-source'
import type { EffectsTarget } from '../../../shared/adjustments'

/**
 * The render job: turn a Take into a Mix. Ported from
 * `worker/akapela_worker/jobs/render.py` (ticket 04).
 *
 * The app inserts the Mix row with every render parameter already fixed —
 * pitch, the Take's own locked tempo, nudge, and gains — and enqueues this
 * job with the Mix id as target. Placing the vocal is two conversions from
 * the same `timeRatio` the browser's Review screen uses (ADR 0003): the
 * Backing Track's own duration scales by it to get the Mix's total length,
 * and the Take's song-time start position (plus nudge) scales by it to get
 * the vocal's wall-clock placement, so a Mix rendered here sounds like what
 * review played. Any failure re-throws so the runner records the message on
 * the job row; nothing retries on its own.
 */

const MIXES_DIRNAME = 'mixes'

const PROGRESS_STARTED = 10
const PROGRESS_RENDERED = 80

function trackDir(dataDir: string, trackId: string): string {
  return join(dataDir, 'tracks', trackId)
}

function mixExists(sqlite: Database.Database, mixId: string): boolean {
  return sqlite.prepare(`SELECT 1 FROM mixes WHERE id = ?`).get(mixId) !== undefined
}

interface RenderRow {
  id: string
  pitch_semitones: number
  tempo_percent: number
  linked: number
  reverb_amount: number
  lowpass_hz: number
  effects_target: EffectsTarget
  backing_source: BackingSource
  latency_nudge_ms: number
  vocal_gain: number
  backing_gain: number
  wav_requested: number
  track_id: string
  start_position_ms: number
  take_file_path: string
}

export const runRender: Handler = async (ctx) => {
  const mixId = ctx.job.targetId
  if (!mixId) throw new Error('render job has no target Mix')
  const row = ctx.sqlite
    .prepare(
      `SELECT m.id, m.pitch_semitones, m.tempo_percent, m.linked, m.reverb_amount, m.lowpass_hz,
        m.effects_target, m.backing_source, m.latency_nudge_ms, m.vocal_gain, m.backing_gain, m.wav_requested,
        t.track_id, t.start_position_ms, t.file_path AS take_file_path
       FROM mixes m JOIN takes t ON t.id = m.take_id
       WHERE m.id = ?`,
    )
    .get(mixId) as RenderRow | undefined
  if (!row) throw new Error(`Mix ${mixId} does not exist`)

  ctx.progress(PROGRESS_STARTED)

  const directory = trackDir(ctx.dataDir, row.track_id)
  // A Mix reproduces its own Backing Source regardless of what the Track has
  // been switched to since (ADR 0003 amendment). Stems can be deleted after a
  // Mix named them, so a missing file fails loudly here rather than silently
  // falling back to the original.
  const backingSource = row.backing_source
  const backing = join(directory, BACKING_SOURCE_FILES[backingSource])
  if (!existsSync(backing)) {
    throw new Error(
      `This Mix was requested against its ${backingSource} Backing Source, which is no longer on disk.`,
    )
  }
  const vocal = join(directory, row.take_file_path)
  const mixesDir = join(directory, MIXES_DIRNAME)
  const mp3Path = join(mixesDir, `${mixId}.mp3`)
  const wavRequested = Boolean(row.wav_requested)
  const wavPath = wavRequested ? join(mixesDir, `${mixId}.wav`) : null

  const tempoPercent = row.tempo_percent
  const timeRatio = 100 / tempoPercent
  const pitchScale = row.linked ? tempoPercent / 100 : 2 ** (row.pitch_semitones / 12)

  const originalDurationMs = await probeDurationMs(backing)
  const targetDurationMs = Math.round(originalDurationMs * timeRatio)
  const targetSongMs = row.start_position_ms + row.latency_nudge_ms
  const vocalWallMs = targetSongMs * timeRatio

  await renderMix({
    backing,
    vocal,
    dstMp3: mp3Path,
    dstWav: wavPath,
    tempo: tempoPercent / 100,
    pitch: pitchScale,
    vocalWallMs,
    vocalGain: row.vocal_gain,
    backingGain: row.backing_gain,
    targetDurationMs,
    reverbAmount: row.reverb_amount,
    lowpassHz: row.lowpass_hz,
    effectsTarget: row.effects_target,
  })
  ctx.progress(PROGRESS_RENDERED)

  // The singer may delete the Mix while its render runs. The row (and the
  // app's own copies of its files) are already gone by then, so what was just
  // written here is an orphan — clean it up rather than resurrect the Mix.
  if (!mixExists(ctx.sqlite, mixId)) {
    await unlink(mp3Path).catch(() => {})
    if (wavPath) await unlink(wavPath).catch(() => {})
    throw new Error(`Mix ${mixId} was deleted during render`)
  }

  ctx.sqlite
    .prepare(`UPDATE mixes SET mp3_path = ?, wav_path = ?, updated_at = ? WHERE id = ?`)
    .run(
      `${MIXES_DIRNAME}/${mixId}.mp3`,
      wavRequested ? `${MIXES_DIRNAME}/${mixId}.wav` : null,
      Date.now(),
      mixId,
    )
}
