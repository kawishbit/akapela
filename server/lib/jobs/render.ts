import { mkdir, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { audioDurationMs, blendStems, renderMix } from '../audio'
import { findAudioFile } from '../audio-files'
import { TRACK_AUDIO_BASENAMES } from '../tracks'
import type { Handler, JobContext } from '../jobs-runner'
import { parseStemLevels, type BackingSource, type StemLevels, type TrackAudioFile } from '../../../shared/backing-source'
import type { EffectsTarget } from '../../../shared/adjustments'
import { CodedError, failure } from '../../../shared/error-codes'
import { trackDir } from './track-paths'

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
  stem_levels: string
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
        m.effects_target, m.backing_source, m.stem_levels, m.latency_nudge_ms, m.vocal_gain, m.backing_gain, m.wav_requested,
        t.track_id, t.start_position_ms, t.file_path AS take_file_path
       FROM mixes m JOIN takes t ON t.id = m.take_id
       WHERE m.id = ?`,
    )
    .get(mixId) as RenderRow | undefined
  if (!row) throw new Error(`Mix ${mixId} does not exist`)

  ctx.progress(PROGRESS_STARTED)

  const directory = trackDir(ctx.dataDir, row.track_id)
  const vocal = join(directory, row.take_file_path)
  const mixesDir = join(directory, MIXES_DIRNAME)
  const mp3Path = join(mixesDir, `${mixId}.mp3`)
  const wavRequested = Boolean(row.wav_requested)
  const wavPath = wavRequested ? join(mixesDir, `${mixId}.wav`) : null
  const blendPath = join(mixesDir, `${mixId}.stems.part.wav`)
  try {
    await render(ctx, row, { directory, vocal, mp3Path, wavPath, blendPath })
  }
  finally {
    await rm(blendPath, { force: true })
  }
  ctx.progress(PROGRESS_RENDERED)

  // The singer may delete the Mix while its render runs, or cancel the render
  // just as it finishes. Either way the row is gone or going, so what was just
  // written here is an orphan — clean it up rather than resurrect the Mix.
  if (ctx.signal.aborted || !mixExists(ctx.sqlite, mixId)) {
    await unlink(mp3Path).catch(() => {})
    if (wavPath) await unlink(wavPath).catch(() => {})
    throw new Error(`Mix ${mixId} was ${ctx.signal.aborted ? 'cancelled' : 'deleted'} during render`)
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

async function render(
  ctx: JobContext,
  row: RenderRow,
  paths: { directory: string, vocal: string, mp3Path: string, wavPath: string | null, blendPath: string },
): Promise<void> {
  // A Mix reproduces its own Backing Source and Stem Levels regardless of what
  // the Track has been switched to since (ADR 0003 amendment).
  const plan = planBacking(row.backing_source, parseStemLevels(JSON.parse(row.stem_levels)))
  const files = new Map<TrackAudioFile, string>()
  for (const file of plan.needs) {
    const path = findAudioFile(paths.directory, TRACK_AUDIO_BASENAMES[file])
    // Stems can be deleted after a Mix named them, so a missing file fails
    // loudly here rather than silently falling back to the original.
    if (!path) throw missingFile(file)
    files.set(file, path)
  }

  let backing: string
  if (plan.kind === 'blend') {
    await mkdir(join(paths.directory, MIXES_DIRNAME), { recursive: true })
    await blendStems(
      { vocals: files.get('vocals')!, instrumental: files.get('instrumental')! },
      plan.levels,
      paths.blendPath,
      ctx.signal,
    )
    backing = paths.blendPath
  }
  else {
    backing = files.get(plan.file)!
  }

  const tempoPercent = row.tempo_percent
  const timeRatio = 100 / tempoPercent
  const pitchScale = row.linked ? tempoPercent / 100 : 2 ** (row.pitch_semitones / 12)

  const originalDurationMs = await audioDurationMs(backing)
  const targetDurationMs = Math.round(originalDurationMs * timeRatio)
  const targetSongMs = row.start_position_ms + row.latency_nudge_ms
  const vocalWallMs = targetSongMs * timeRatio

  await renderMix({
    backing,
    vocal: paths.vocal,
    dstMp3: paths.mp3Path,
    dstWav: paths.wavPath,
    tempo: tempoPercent / 100,
    pitch: pitchScale,
    vocalWallMs,
    vocalGain: row.vocal_gain,
    backingGain: row.backing_gain * plan.gain,
    targetDurationMs,
    reverbAmount: row.reverb_amount,
    lowpassHz: row.lowpass_hz,
    effectsTarget: row.effects_target,
    signal: ctx.signal,
  })
}

/**
 * Which stored files a Mix's Backing Track is made from, and how. Original is
 * the one file. Stems are blended before the one stretch, as the browser
 * blends them before its Rubber Band worklet (ADR 0003), but only when both
 * levels are above zero: a single Stem needs no blend, only its level, which
 * the backing gain stage applies after the stretch and the Effects. All three
 * scale linearly, so where the level is applied does not change what is
 * heard. That keeps the default 0/100 exactly the render a Mix against the
 * Instrumental Stem always was, and both at zero a silent backing of the
 * Stems' own length rather than a failure.
 */
export type BackingPlan
  = | { kind: 'file', file: TrackAudioFile, gain: number, needs: TrackAudioFile[] }
    | { kind: 'blend', levels: StemLevels, gain: 1, needs: TrackAudioFile[] }

export function planBacking(source: BackingSource, levels: StemLevels): BackingPlan {
  if (source === 'original') return { kind: 'file', file: 'original', gain: 1, needs: ['original'] }
  const { guideVocal, instrumental } = levels
  if (guideVocal === 0) return { kind: 'file', file: 'instrumental', gain: instrumental, needs: ['instrumental'] }
  if (instrumental === 0) return { kind: 'file', file: 'vocals', gain: guideVocal, needs: ['vocals'] }
  return { kind: 'blend', levels, gain: 1, needs: ['vocals', 'instrumental'] }
}

const FILE_NAMES: Record<TrackAudioFile, string> = {
  original: 'original audio',
  instrumental: 'Instrumental Stem',
  vocals: 'Vocals Stem',
}

function missingFile(file: TrackAudioFile): Error {
  const message = `This Mix was requested against the ${FILE_NAMES[file]}, which is no longer on disk.`
  return file === 'original' ? new Error(message) : new CodedError(failure('noStems'), message)
}
