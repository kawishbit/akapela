import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { decodeWav, encodeWav } from '../../../app/audio/wav'
import { fetchModel, modelPath, type FetchModelOptions } from '../separators/download-model'
import { DEFAULT_SEPARATION_MODEL, SEPARATION_MODELS, type SeparationModel } from '../separators/models'
import { formatSeparateCliArgs } from '../separators/cli-args'
import { cliOutputReader } from '../separators/progress'
import { childEnv, killOnAbort, separateCliPath } from '../tools'
import { cpuCoresFor } from '../../../shared/separation'
import { hostCores, type Hardware } from '../hardware'
import type { Accelerator } from '../separators/accelerator'
import type { Handler, JobContext } from '../jobs-runner'
import { decodeToWav, storeWavAs } from '../audio'
import {
  audioFileName,
  audioFormatOf,
  BACKING_BASENAME,
  findAudioFile,
  INSTRUMENTAL_BASENAME,
  replaceAudioFile,
  VOCALS_BASENAME,
} from '../audio-files'
import { audioFormatNow, ensureNotDeleted, trackDir, trackExists } from './track-paths'

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
  /** Why the GPU failed, when the Separation started on it and finished on the CPU. */
  gpuFailure?: string
}

export interface SeparateOptions {
  /** Which Separation Model to run. `Inst_Main` when left out. */
  model?: SeparationModel
  /** How many cores the model may use: the core limit in force when this Separation started. */
  threads?: number
  /** The GPU backend to try first, when acceleration was on as this Separation started. */
  accelerator?: Accelerator | null
  /** Stops the model run when it aborts, killing its subprocess; the Separation is then rejected. */
  signal?: AbortSignal
  /** Receives how far the model run has got, 0 to 1, as it goes. May never be called. */
  onProgress?: (fraction: number) => void
}

export interface Separator {
  /** Puts `model` in `modelsDir`, or does nothing if it is already there. */
  fetchModel: (modelsDir: string, model: SeparationModel, options?: FetchModelOptions) => Promise<void>
  /** Runs the model over the Backing Track at `backingPath`, in whichever Audio Format it is stored. */
  separate: (backingPath: string, modelsDir: string, options?: SeparateOptions) => Promise<Stems>
}

export class MdxNetSeparator implements Separator {
  async fetchModel(modelsDir: string, model: SeparationModel, options?: FetchModelOptions): Promise<void> {
    await fetchModel(modelsDir, model, options)
  }

  async separate(backingPath: string, modelsDir: string, options: SeparateOptions = {}): Promise<Stems> {
    const model = options.model ?? SEPARATION_MODELS[DEFAULT_SEPARATION_MODEL]
    const path = await fetchModel(modelsDir, model)
    const scratchDir = await mkdtemp(join(tmpdir(), 'akapela-separate-'))
    const instrumentalPath = join(scratchDir, 'instrumental.wav')
    const vocalsPath = join(scratchDir, 'vocals.wav')
    try {
      // The subprocess reads WAV only, and decodes it itself; a master stored
      // in another Audio Format is decoded for it first.
      let input = backingPath
      if (audioFormatOf(backingPath) !== 'wav') {
        input = join(scratchDir, 'backing.wav')
        await decodeToWav(backingPath, input, options.signal)
      }
      const { gpuFailure } = await runSeparateCli(model, path, input, instrumentalPath, vocalsPath, options)
      const instrumentalWav = decodeWav(await readFile(instrumentalPath))
      const vocalsWav = decodeWav(await readFile(vocalsPath))
      return {
        instrumental: [Float64Array.from(instrumentalWav.channels[0]!), Float64Array.from(instrumentalWav.channels[1]!)],
        vocals: [Float64Array.from(vocalsWav.channels[0]!), Float64Array.from(vocalsWav.channels[1]!)],
        sampleRate: instrumentalWav.sampleRate,
        ...(gpuFailure === undefined ? {} : { gpuFailure }),
      }
    }
    finally {
      await rm(scratchDir, { recursive: true, force: true })
    }
  }
}

/**
 * What the subprocess says that is worth a log line but not a failure — a
 * priority it could not lower, say. Logged once per process rather than once
 * per Separation, since a Playlist Import would otherwise say the same thing
 * thirty times.
 */
const loggedNotices = new Set<string>()
function logNoticeOnce(text: string): void {
  if (loggedNotices.has(text)) return
  loggedNotices.add(text)
  console.warn(`separation: ${text}`)
}

function runSeparateCli(
  model: SeparationModel,
  modelPath: string,
  backingPath: string,
  instrumentalOutPath: string,
  vocalsOutPath: string,
  { signal, onProgress, threads = hostCores(), accelerator }: SeparateOptions,
): Promise<{ gpuFailure?: string }> {
  return new Promise((resolve, reject) => {
    // `separate-cli.ts`, run as its own subprocess — CPU isolation for the
    // ONNX inference, the same shape as every other heavy external dependency
    // this app spawns (ffmpeg, yt-dlp) rather than links against. `childEnv`
    // carries `ELECTRON_RUN_AS_NODE=1`, without which `process.execPath` under
    // a packaged desktop app is the GUI binary and this spawns a second
    // window instead of running the CLI.
    const child = spawn(
      process.execPath,
      [separateCliPath(), ...formatSeparateCliArgs({
        modelName: model.name,
        modelPath,
        inputPath: backingPath,
        instrumentalPath: instrumentalOutPath,
        vocalsPath: vocalsOutPath,
        threads,
        ...(accelerator ? { accelerator } : {}),
      })],
      { env: childEnv() },
    )
    killOnAbort(child, signal)
    let gpuFailure: string | undefined
    child.stdout.on('data', cliOutputReader({
      onFraction: onProgress,
      onNotice: logNoticeOnce,
      onFallback: reason => (gpuFailure = reason),
    }))
    let stderr = ''
    child.stderr.on('data', d => (stderr += d))
    child.on('error', error => reject(new Error(`could not start the separation subprocess: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(gpuFailure === undefined ? {} : { gpuFailure })
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

const SEPARATION_DIRNAME = 'stems.part'

const MODELS_DIRNAME = 'cache/models'
const LEGACY_MODELS_DIRNAME = 'models'

/** What the Jobs page row says of a Separation the GPU started and the CPU finished. */
export const GPU_FAILED_DETAIL = 'Finished on CPU: the GPU failed'

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
 * Whether `model` is cached, in either layout, so Settings can say which
 * Separation Models are already here and which the first use downloads. Only
 * a download that passed its hash check is renamed into place, so a file
 * here is the whole model.
 */
export function modelIsDownloaded(dataDir: string, model: SeparationModel): boolean {
  return [MODELS_DIRNAME, LEGACY_MODELS_DIRNAME].some(dir => existsSync(modelPath(join(dataDir, dir), model)))
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

/**
 * Downloads the model if it is not cached yet, saying so on the Job row and
 * filling the band up to the model being ready as it arrives. A model already
 * on disk says nothing, since there is nothing to wait for.
 */
async function fetchWithDetail(ctx: JobContext, separator: Separator, models: string, model: SeparationModel): Promise<void> {
  if (existsSync(modelPath(models, model))) return
  ctx.detail(`Downloading ${model.name}`)
  let reported = PROGRESS_STARTED
  try {
    await separator.fetchModel(models, model, {
      signal: ctx.signal,
      onProgress: (fraction) => {
        const percent = PROGRESS_STARTED + Math.floor((PROGRESS_MODEL_READY - PROGRESS_STARTED) * fraction)
        if (percent > reported && percent < PROGRESS_MODEL_READY) {
          reported = percent
          ctx.progress(percent)
        }
      },
    })
  }
  finally {
    ctx.detail(null)
  }
}

/** This machine as far as a Separation is concerned, when nobody has said otherwise. */
async function thisMachine(): Promise<Hardware> {
  return { cores: hostCores(), accelerator: null }
}

/**
 * The separate job bound to the separator that will stand in for the model,
 * and to the machine it runs on — the server's own detection in production,
 * so the Job and Settings agree on what the hardware is.
 */
export function separateHandler(separator: Separator, hardware: () => Promise<Hardware> = thisMachine): Handler {
  return ctx => runSeparateWith(ctx, separator, hardware)
}

/**
 * The settings that change how fast a Separation runs but not what it
 * produces, read when it starts rather than when it was asked for (ADR 0013
 * amendment): a limit lowered while thirty Separations wait applies to the
 * next one to start, never to the one already running.
 */
async function startingOptions(
  ctx: JobContext,
  hardware: () => Promise<Hardware>,
): Promise<{ threads: number, accelerator: Accelerator | null }> {
  const row = ctx.sqlite.prepare(`SELECT cpu_cores, hardware_acceleration FROM settings WHERE id = 1`).get() as
    { cpu_cores: number | null, hardware_acceleration: number } | undefined
  const { cores, accelerator } = await hardware()
  const accelerate = row === undefined || Boolean(row.hardware_acceleration)
  return {
    threads: cpuCoresFor(row?.cpu_cores ?? null, cores),
    accelerator: accelerate ? accelerator : null,
  }
}

async function runSeparateWith(ctx: JobContext, separator: Separator, hardware: () => Promise<Hardware>): Promise<void> {
  const trackId = ctx.job.targetId
  if (!trackId) throw new Error('separate job has no target Track')
  if (!trackExists(ctx.sqlite, trackId)) throw new Error(`Track ${trackId} does not exist`)

  const directory = trackDir(ctx.dataDir, trackId)
  // Everything from here on is inside the guard, so every failure a Track
  // can still be reached after leaves it `failed` rather than stuck
  // `separating`.
  try {
    const backing = findAudioFile(directory, BACKING_BASENAME)
    if (!backing) throw new Error(`Track ${trackId} has no Backing Track to separate`)
    ctx.progress(PROGRESS_STARTED)

    // Fixed when the Separation was asked for; a row from before there was a
    // choice ran the only model there was.
    const model = SEPARATION_MODELS[ctx.job.separationModel ?? DEFAULT_SEPARATION_MODEL]
    const models = await modelsDir(ctx.dataDir)
    await fetchWithDetail(ctx, separator, models, model)
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
    const { threads, accelerator } = await startingOptions(ctx, hardware)
    const { instrumental, vocals, sampleRate, gpuFailure } = await separator.separate(backing, models, {
      model,
      signal: ctx.signal,
      onProgress,
      threads,
      accelerator,
    })
    if (gpuFailure !== undefined) {
      // Finished anyway; the row says it took the long way, the log says why.
      console.warn(`separation of Track ${trackId}: the GPU failed, finishing on the CPU: ${gpuFailure}`)
      ctx.detail(GPU_FAILED_DETAIL)
    }
    ctx.signal.throwIfAborted()

    const scratch = join(directory, SEPARATION_DIRNAME)
    await rm(scratch, { recursive: true, force: true })
    try {
      await mkdir(scratch, { recursive: true })
      // In the Audio Format in force now, not when the Separation was asked
      // for: it changes how the Stems are kept, never what they sound like.
      const format = audioFormatNow(ctx.sqlite)
      const stems = [
        { basename: INSTRUMENTAL_BASENAME, channels: instrumental },
        { basename: VOCALS_BASENAME, channels: vocals },
      ]
      const stored: Array<{ basename: string, path: string }> = []
      for (const { basename, channels } of stems) {
        const wav = join(scratch, `${basename}.pcm.wav`)
        await writeFile(wav, encodeWav({
          channels: [Float32Array.from(channels[0]), Float32Array.from(channels[1])],
          sampleRate,
        }))
        const path = join(scratch, audioFileName(basename, format))
        await storeWavAs(wav, path, ctx.signal)
        stored.push({ basename, path })
      }

      await ensureNotDeleted(ctx.sqlite, trackId, directory, 'separation')
      // The last moment a cancel can still keep the Track's existing Stems:
      // nothing before this has touched them.
      ctx.signal.throwIfAborted()
      for (const { basename, path } of stored) {
        const destination = join(directory, audioFileName(basename, format))
        await rename(path, destination)
        // Stems the previous Separation stored in another Audio Format.
        await replaceAudioFile(directory, basename, destination)
      }
    }
    finally {
      await rm(scratch, { recursive: true, force: true })
    }
    ctx.progress(PROGRESS_STEMS_WRITTEN)

    await ensureNotDeleted(ctx.sqlite, trackId, directory, 'separation')
    ctx.sqlite
      .prepare(`UPDATE tracks SET separation_state = 'ready', backing_source = 'instrumental', stems_model = ?, updated_at = ? WHERE id = ?`)
      .run(model.name, Date.now(), trackId)
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
