import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { decodeWav, encodeWav } from '../../../app/audio/wav'
import { fetchModel } from '../separators/download-model'
import { chunkProgressReader } from '../separators/progress'
import { childEnv, killOnAbort, separateCliPath } from '../tools'
import type { Handler } from '../jobs-runner'
import { BACKING_TRACK_FILE, ensureNotDeleted, trackDir, trackExists } from './track-paths'

/**
 * The separation model is to vocal removal what yt-dlp is to importing — a
 * large third-party thing that breaks, and that a better one will eventually
 * replace — so every call into it sits behind `Separator` (ADR 0008), the
 * same guard the Python worker gave it. Tests substitute a fake; the real
 * model never runs in the suite, because it is a network fetch and minutes
 * of CPU.
 */
export interface Stems {
  instrumental: [Float64Array, Float64Array]
  vocals: [Float64Array, Float64Array]
  sampleRate: number
}

export interface SeparateOptions {
  /** Stops the model run when it aborts, killing its subprocess; the Separation is then rejected. */
  signal?: AbortSignal
  /** Receives how far the model run has got, 0 to 1, as it goes. May never be called. */
  onProgress?: (fraction: number) => void
}

export interface Separator {
  /** Puts the separation model in `modelsDir`, or does nothing if it is already there. */
  fetchModel: (modelsDir: string) => Promise<void>
  /** Runs the model over the Backing Track WAV at `backingPath`. */
  separate: (backingPath: string, modelsDir: string, options?: SeparateOptions) => Promise<Stems>
}

export class MdxNetSeparator implements Separator {
  private modelPath: string | undefined

  async fetchModel(modelsDir: string): Promise<void> {
    this.modelPath = await fetchModel(modelsDir)
  }

  async separate(backingPath: string, modelsDir: string, options: SeparateOptions = {}): Promise<Stems> {
    const modelPath = this.modelPath ?? await fetchModel(modelsDir)
    const scratchDir = await mkdtemp(join(tmpdir(), 'akapela-separate-'))
    const instrumentalPath = join(scratchDir, 'instrumental.wav')
    const vocalsPath = join(scratchDir, 'vocals.wav')
    try {
      await runSeparateCli(modelPath, backingPath, instrumentalPath, vocalsPath, options)
      const instrumentalWav = decodeWav(await readFile(instrumentalPath))
      const vocalsWav = decodeWav(await readFile(vocalsPath))
      return {
        instrumental: [Float64Array.from(instrumentalWav.channels[0]!), Float64Array.from(instrumentalWav.channels[1]!)],
        vocals: [Float64Array.from(vocalsWav.channels[0]!), Float64Array.from(vocalsWav.channels[1]!)],
        sampleRate: instrumentalWav.sampleRate,
      }
    }
    finally {
      await rm(scratchDir, { recursive: true, force: true })
    }
  }
}

function runSeparateCli(
  modelPath: string,
  backingPath: string,
  instrumentalOutPath: string,
  vocalsOutPath: string,
  { signal, onProgress }: SeparateOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // `separate-cli.ts`, run as its own subprocess — CPU isolation for the
    // ONNX inference, the same shape as every other heavy external dependency
    // this app spawns (ffmpeg, yt-dlp) rather than links against. `childEnv`
    // carries `ELECTRON_RUN_AS_NODE=1`, without which `process.execPath` under
    // a packaged desktop app is the GUI binary and this spawns a second
    // window instead of running the CLI.
    const child = spawn(
      process.execPath,
      [separateCliPath(), modelPath, backingPath, instrumentalOutPath, vocalsOutPath],
      { env: childEnv() },
    )
    killOnAbort(child, signal)
    if (onProgress) child.stdout.on('data', chunkProgressReader(onProgress))
    let stderr = ''
    child.stderr.on('data', d => (stderr += d))
    child.on('error', error => reject(new Error(`could not start the separation subprocess: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `separation subprocess exited with code ${code}`))
    })
  })
}

/**
 * The separate job: turn a Track's Backing Track into its Stems. Ported from
 * `worker/akapela_worker/jobs/separate.py` (ticket 06,
 * `.scratch/worker-to-typescript/`), now running the TS separation pipeline
 * validated in ticket 05 instead of shelling out to Python.
 *
 * The model is fetched on first use into `<dataDir>/cache/models/`, never at
 * startup, so the first separation on a machine pays for the download and
 * none after it does (ADR 0008). Both Stems are produced by one model call
 * and written into a scratch directory first, so a Track that already has
 * Stems keeps them until the new run has produced replacements — the model
 * run is the long, failure-prone part.
 *
 * A run that succeeds also puts the Track's `backing_source` on the
 * Instrumental Stem it just wrote; a run that fails leaves the Track's
 * current audio alone. Any failure re-throws so the runner records the
 * message on the job row. Nothing retries on its own.
 */

export const INSTRUMENTAL_STEM_FILE = 'instrumental.wav'
export const VOCALS_STEM_FILE = 'vocals.wav'
const SEPARATION_DIRNAME = 'stems.part'

const MODELS_DIRNAME = 'cache/models'
const LEGACY_MODELS_DIRNAME = 'models'

// Progress milestones. The model run fills the band between the second and
// third, a chunk at a time; the runner writes the final 100.
const PROGRESS_STARTED = 10
const PROGRESS_MODEL_READY = 30
const PROGRESS_STEMS_WRITTEN = 85

/**
 * Where a model run that is `fraction` done puts the Job: inside the band
 * between the model being ready and the Stems being written, and always short
 * of the latter, which only the Stems existing may claim.
 */
export function separationPercent(fraction: number): number {
  const band = PROGRESS_STEMS_WRITTEN - PROGRESS_MODEL_READY
  const percent = PROGRESS_MODEL_READY + Math.floor(band * Math.max(0, Math.min(1, fraction)))
  return Math.min(percent, PROGRESS_STEMS_WRITTEN - 1)
}

/**
 * Where model weights are cached, migrating a pre-cache-split layout in
 * place (ticket 01) — a self-hoster upgrading straight past every
 * intermediate version still keeps their cached model instead of
 * re-downloading it, now that the Python worker that used to do this
 * migration is gone.
 */
async function modelsDir(dataDir: string): Promise<string> {
  const current = join(dataDir, MODELS_DIRNAME)
  const legacy = join(dataDir, LEGACY_MODELS_DIRNAME)
  if (!existsSync(current) && existsSync(legacy)) {
    await mkdir(dirname(current), { recursive: true })
    await rename(legacy, current)
  }
  return current
}

/** The separate job bound to the separator that will stand in for the model. */
export function separateHandler(separator: Separator): Handler {
  return ctx => runSeparateWith(ctx, separator)
}

async function runSeparateWith(ctx: Parameters<Handler>[0], separator: Separator): Promise<void> {
  const trackId = ctx.job.targetId
  if (!trackId) throw new Error('separate job has no target Track')
  if (!trackExists(ctx.sqlite, trackId)) throw new Error(`Track ${trackId} does not exist`)

  const directory = trackDir(ctx.dataDir, trackId)
  // Everything from here on is inside the guard, so every failure a Track
  // can still be reached after leaves it `failed` rather than stuck
  // `separating`.
  try {
    const backing = join(directory, BACKING_TRACK_FILE)
    if (!existsSync(backing)) throw new Error(`Track ${trackId} has no Backing Track to separate`)
    ctx.progress(PROGRESS_STARTED)

    const models = await modelsDir(ctx.dataDir)
    await separator.fetchModel(models)
    ctx.signal.throwIfAborted()
    ctx.progress(PROGRESS_MODEL_READY)

    // Only when the number moves, and never backwards: a long song is a few
    // hundred chunks, and the row need not hear about every one.
    let reported = PROGRESS_MODEL_READY
    const onProgress = (fraction: number) => {
      const percent = separationPercent(fraction)
      if (percent > reported) {
        reported = percent
        ctx.progress(percent)
      }
    }
    const { instrumental, vocals, sampleRate } = await separator.separate(backing, models, { signal: ctx.signal, onProgress })
    ctx.signal.throwIfAborted()

    const scratch = join(directory, SEPARATION_DIRNAME)
    await rm(scratch, { recursive: true, force: true })
    try {
      await mkdir(scratch, { recursive: true })
      const instrumentalPath = join(scratch, INSTRUMENTAL_STEM_FILE)
      const vocalsPath = join(scratch, VOCALS_STEM_FILE)
      await writeFile(instrumentalPath, encodeWav({
        channels: [Float32Array.from(instrumental[0]), Float32Array.from(instrumental[1])],
        sampleRate,
      }))
      await writeFile(vocalsPath, encodeWav({
        channels: [Float32Array.from(vocals[0]), Float32Array.from(vocals[1])],
        sampleRate,
      }))

      await ensureNotDeleted(ctx.sqlite, trackId, directory, 'separation')
      // The last moment a cancel can still keep the Track's existing Stems:
      // nothing before this has touched them.
      ctx.signal.throwIfAborted()
      await rename(instrumentalPath, join(directory, INSTRUMENTAL_STEM_FILE))
      await rename(vocalsPath, join(directory, VOCALS_STEM_FILE))
    }
    finally {
      await rm(scratch, { recursive: true, force: true })
    }
    ctx.progress(PROGRESS_STEMS_WRITTEN)

    await ensureNotDeleted(ctx.sqlite, trackId, directory, 'separation')
    ctx.sqlite
      .prepare(`UPDATE tracks SET separation_state = 'ready', backing_source = 'instrumental', updated_at = ? WHERE id = ?`)
      .run(Date.now(), trackId)
  }
  catch (error) {
    // Cancelled: the cancel puts the Track's state back once this returns.
    if (ctx.signal.aborted) throw error
    // The job row carries the message; the Track carries the state a card
    // renders, and it is `failed` that puts the error and its retry button
    // on the Track.
    await ensureNotDeleted(ctx.sqlite, trackId, directory, 'separation')
    ctx.sqlite
      .prepare(`UPDATE tracks SET separation_state = 'failed', updated_at = ? WHERE id = ?`)
      .run(Date.now(), trackId)
    throw error
  }
}
