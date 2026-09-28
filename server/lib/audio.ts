import { existsSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import {
  effectsReachBacking,
  effectsReachVocal,
  LOWPASS_HZ_MAX,
  REVERB_AMOUNT_MIN,
  type EffectsTarget,
} from '../../shared/adjustments'
import { audioFormatOf } from './audio-files'
import { childEnv, ffmpegPath, killOnAbort, rubberBandWasmPath, stretchCliPath } from './tools'
import type { AudioFormat } from '../../shared/audio-format'

/**
 * Thin wrappers over ffmpeg, ported from `worker/akapela_worker/audio.py`
 * (ticket 03/04 of `.scratch/worker-to-typescript/`; ffmpeg was always just a
 * subprocess call, never a Python-specific dependency).
 *
 * Every stored audio master is 44.1 kHz stereo 16-bit, in the Audio Format in
 * force when it was written (ADR 0016).
 */

export const BACKING_SAMPLE_RATE = 44100
export const BACKING_CHANNELS = 2

export class AudioError extends Error {}

/** Runs ffmpeg and rejects with `AudioError` on a non-zero exit, or once `signal` has killed it. */
function run(bin: 'ffmpeg', args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args)
    killOnAbort(child, signal)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += d))
    child.stderr.on('data', d => (stderr += d))
    child.on('error', error => reject(new AudioError(`could not start ${bin}: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new AudioError(`${bin} exited ${code}: ${cleanFfmpegStderr(stderr) || `exit code ${code}`}`))
    })
  })
}

/** Drops ffmpeg's `[in#0 @ 0x...]` context tags; a singer reading the card does not need them. */
function cleanFfmpegStderr(stderr: string): string {
  return stderr
    .split('\n')
    .map(line => line.replace(/^\[[^\]]*\]\s*/, '').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * The ffmpeg output options that store 16-bit PCM in each Audio Format. FLAC
 * keeps the 16 bits exactly, so a FLAC file decodes to the samples the WAV
 * would have held.
 */
function codecArgs(format: AudioFormat): string[] {
  switch (format) {
    case 'wav': return ['-c:a', 'pcm_s16le']
    case 'flac': return ['-c:a', 'flac', '-sample_fmt', 's16']
  }
}

function formatOfStored(path: string): AudioFormat {
  const format = audioFormatOf(path)
  if (!format) throw new AudioError(`${path} is not named as any Audio Format`)
  return format
}

/** Where a file is written before it is renamed into place: beside it, same extension, so ffmpeg picks the same muxer. */
function partPath(path: string): string {
  const dot = path.lastIndexOf('.')
  return `${path.slice(0, dot)}.part${path.slice(dot)}`
}

/** ffmpeg's own message, without the exit-code preamble `run` puts on it. */
function ffmpegReason(error: AudioError): string {
  return error.message.replace(/^ffmpeg exited \d+: /, '')
}

/**
 * Decodes any Source audio and writes it as the 44.1 kHz stereo 16-bit
 * Backing Track, in the Audio Format `dst`'s extension names.
 */
export async function normalizeToBackingTrack(src: string, dst: string, signal?: AbortSignal): Promise<void> {
  await mkdir(dirname(dst), { recursive: true })
  const tmp = partPath(dst)
  try {
    await run('ffmpeg', [
      '-y',
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      src,
      '-vn',
      '-ac',
      String(BACKING_CHANNELS),
      '-ar',
      String(BACKING_SAMPLE_RATE),
      ...codecArgs(formatOfStored(dst)),
      tmp,
    ], signal)
  }
  catch (error) {
    await rm(tmp, { force: true })
    throw error instanceof AudioError
      ? new AudioError(`ffmpeg could not decode ${src}: ${error.message.replace(/^ffmpeg exited \d+: /, '')}`)
      : error
  }
  await rename(tmp, dst)
}

/**
 * Stores a 16-bit WAV that Akapela wrote itself — a Stem, fresh from the
 * separation — as `dst`, in the Audio Format its extension names. A WAV is
 * only moved; anything else is re-encoded, and `src` removed once `dst`
 * exists.
 */
export async function storeWavAs(src: string, dst: string, signal?: AbortSignal): Promise<void> {
  const format = formatOfStored(dst)
  if (format === 'wav') {
    await rename(src, dst)
    return
  }
  const tmp = partPath(dst)
  try {
    await run('ffmpeg', ['-y', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', src, ...codecArgs(format), tmp], signal)
  }
  catch (error) {
    await rm(tmp, { force: true })
    throw error instanceof AudioError ? new AudioError(`ffmpeg could not store ${dst}: ${ffmpegReason(error)}`) : error
  }
  await rename(tmp, dst)
  await rm(src, { force: true })
}

/**
 * A stored master or Stem as a 16-bit WAV at `dst`, for the two readers that
 * only take WAV — the separation and the stretch subprocesses, which decode
 * it themselves rather than linking a codec. The caller removes `dst`.
 */
export async function decodeToWav(src: string, dst: string, signal?: AbortSignal): Promise<void> {
  try {
    await run('ffmpeg', ['-y', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', src, '-c:a', 'pcm_s16le', dst], signal)
  }
  catch (error) {
    await rm(dst, { force: true })
    throw error instanceof AudioError ? new AudioError(`ffmpeg could not decode ${src}: ${ffmpegReason(error)}`) : error
  }
}

/**
 * The duration of a stored master or Stem, in milliseconds, read from the
 * file's own header in whichever Audio Format it is. Never ffprobe.
 */
export async function audioDurationMs(path: string): Promise<number> {
  switch (formatOfStored(path)) {
    case 'wav': return wavDurationMs(path)
    case 'flac': return flacDurationMs(path)
  }
}

/**
 * The duration of a FLAC file, from its `STREAMINFO` block: the total number
 * of samples over the sample rate, both fixed fields in the block every FLAC
 * file starts with. ffmpeg fills the total in once it has finished writing,
 * which is always the case for a file Akapela stored.
 */
export async function flacDurationMs(path: string): Promise<number> {
  const fail = (why: string) => new AudioError(`could not read the duration of ${path}: ${why}`)
  const handle = await open(path, 'r').catch((error: Error) => {
    throw fail(error.message)
  })
  try {
    // "fLaC", a 4-byte block header, then STREAMINFO's 34 bytes.
    const head = Buffer.alloc(42)
    const { bytesRead } = await handle.read(head, 0, 42, 0)
    if (bytesRead < 42 || head.toString('ascii', 0, 4) !== 'fLaC') throw fail('it is not a FLAC file')
    if ((head[4]! & 0x7F) !== 0) throw fail('its first block is not STREAMINFO')
    // Bytes 18-25 of the file: 20 bits of sample rate, 3 of channels, 5 of
    // bits per sample, then 36 of total samples.
    const sampleRate = (head[18]! << 12) | (head[19]! << 4) | (head[20]! >> 4)
    const totalSamples = (head[21]! & 0x0F) * 2 ** 32 + head.readUInt32BE(22)
    if (sampleRate === 0) throw fail('its sample rate is zero')
    if (totalSamples === 0) throw fail('it does not say how long it is')
    return Math.round((totalSamples / sampleRate) * 1000)
  }
  finally {
    await handle.close()
  }
}

/**
 * The duration of a WAV file, in milliseconds, read from its own header.
 *
 * Every file this is asked about is one Akapela wrote itself: a Backing Track
 * `normalizeToBackingTrack` produced, or a Stem the separation encoded. Both
 * are plain PCM WAV (ADR 0005), whose duration is its data chunk's size over
 * its byte rate — the same arithmetic ffprobe does for PCM. Reading that here
 * is what lets no installer ship ffprobe, which was a second full copy of
 * ffmpeg's codecs for this one number.
 *
 * Only chunk headers are read, never the audio. A data chunk whose declared
 * size is unset (0xFFFFFFFF, as a streamed write leaves it) or overruns the
 * file is measured to the end of the file.
 */
export async function wavDurationMs(path: string): Promise<number> {
  const fail = (why: string) => new AudioError(`could not read the duration of ${path}: ${why}`)
  const handle = await open(path, 'r').catch((error: Error) => {
    throw fail(error.message)
  })
  try {
    const fileBytes = (await handle.stat()).size
    const header = Buffer.alloc(12)
    await handle.read(header, 0, 12, 0)
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw fail('it is not a WAV file')
    }

    let byteRate = 0
    let offset = 12
    const chunk = Buffer.alloc(16)
    while (offset + 8 <= fileBytes) {
      await handle.read(chunk, 0, 8, offset)
      const id = chunk.toString('ascii', 0, 4)
      const size = chunk.readUInt32LE(4)
      const body = offset + 8
      if (id === 'fmt ') {
        await handle.read(chunk, 0, 16, body)
        byteRate = chunk.readUInt32LE(8)
      }
      else if (id === 'data') {
        if (!byteRate) throw fail('its audio comes before its format')
        const remaining = fileBytes - body
        const dataBytes = size === 0xFFFFFFFF || size > remaining ? remaining : size
        return Math.round((dataBytes / byteRate) * 1000)
      }
      offset = body + size + (size % 2)
    }
    throw fail('it has no audio data')
  }
  finally {
    await handle.close()
  }
}

/**
 * The one impulse response ADR 0003 requires both engines to share; the
 * browser's `app/audio/engine.ts` loads the same file from `public/audio/`.
 * Resolved by checking the built output first rather than assuming a `cwd`:
 * `pnpm dev` serves straight from `public/`, the compose image serves the
 * copy Nuxt's build already puts in `.output/public/` next to it.
 *
 * Both of those still assume the cwd is the app's own root, and the desktop
 * shell is the one place where it is not: the server is a child of Electron
 * and inherits whatever directory the app was launched from. `AKAPELA_PUBLIC_DIR`
 * is that override, the same shape every path in `tools.ts` already takes —
 * set by the shell, set by nobody else, so compose and `pnpm dev` keep the
 * behaviour below verbatim. Without it a Mix with any reverb fails in the
 * packaged app with ffmpeg's "No such file or directory" against a path
 * built from wherever the singer happened to start Akapela.
 */
export function impulseResponsePath(): string {
  const fromShell = process.env.AKAPELA_PUBLIC_DIR?.trim()
  if (fromShell) return join(fromShell, 'audio', 'large-hall-ir.wav')
  const built = resolve('.output/public/audio/large-hall-ir.wav')
  return existsSync(built) ? built : resolve('public/audio/large-hall-ir.wav')
}

export interface RenderMixOptions extends MixFilterGraphOptions {
  backing: string
  vocal: string
  dstMp3: string
  dstWav: string | null
  tempo: number
  pitch: number
  /** Kills whichever subprocess is running when it aborts; the partial files go with it. */
  signal?: AbortSignal
}

/**
 * Appends the Effects — reverb, then low-pass, the order both engines build
 * them in (ADR 0003) — onto one signal's `segments`, and returns the label
 * they leave it on.
 *
 * Either filter at its bypassed value contributes no segment at all, so a
 * signal the Effects Target does not reach passes through exactly as it would
 * have before there were Effects to apply.
 */
export function appendEffects(
  segments: string[],
  options: { label: string, prefix: string, reverbAmount: number, lowpassHz: number, impulseLabel: string },
): string {
  let { label } = options
  const { prefix, reverbAmount, lowpassHz, impulseLabel } = options

  if (reverbAmount > REVERB_AMOUNT_MIN) {
    const wet = reverbAmount / 100
    const dry = 1 - wet
    segments.push(`[${label}]asplit=2[${prefix}_dry][${prefix}_wet_in]`)
    segments.push(`[${prefix}_wet_in]${impulseLabel}afir=dry=1:wet=1[${prefix}_wet]`)
    segments.push(
      `[${prefix}_dry][${prefix}_wet]amix=inputs=2:`
      + `weights=${dry.toFixed(6)} ${wet.toFixed(6)}:normalize=0[${prefix}_reverbed]`,
    )
    label = `${prefix}_reverbed`
  }

  if (lowpassHz < LOWPASS_HZ_MAX) {
    segments.push(`[${label}]lowpass=f=${lowpassHz}[${prefix}_lp]`)
    label = `${prefix}_lp`
  }

  return label
}

/** Runs the stretch subprocess and rejects with `AudioError` on a non-zero exit. */
function runStretch(src: string, dst: string, timeRatio: number, pitchScale: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // `childEnv` carries `ELECTRON_RUN_AS_NODE=1`, without which
    // `process.execPath` under the packaged desktop app is the GUI binary.
    const child = spawn(
      process.execPath,
      [stretchCliPath(), rubberBandWasmPath(), src, dst, String(timeRatio), String(pitchScale)],
      { env: childEnv() },
    )
    killOnAbort(child, signal)
    let stderr = ''
    child.stderr.on('data', d => (stderr += d))
    child.on('error', error => reject(new AudioError(`could not start the stretch subprocess: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new AudioError(stderr.trim() || `stretch subprocess exited with code ${code}`))
    })
  })
}

export interface MixFilterGraphOptions {
  vocalWallMs: number
  vocalGain: number
  backingGain: number
  targetDurationMs: number
  reverbAmount?: number
  lowpassHz?: number
  effectsTarget?: EffectsTarget
}

/**
 * The `-filter_complex` for a Mix, over inputs `0` the Backing Track (already
 * stretched), `1` the Take's dry vocal, and `2` the impulse response when
 * `wantsImpulseResponse`. Nothing in it needs more than a stock ffmpeg.
 */
export function buildMixFilterGraph(options: MixFilterGraphOptions): { filterComplex: string, wantsImpulseResponse: boolean } {
  const {
    vocalWallMs, vocalGain, backingGain, targetDurationMs,
    reverbAmount = REVERB_AMOUNT_MIN, lowpassHz = LOWPASS_HZ_MAX, effectsTarget = 'backing',
  } = options
  const targetSeconds = targetDurationMs / 1000

  let vocalChain: string
  if (vocalWallMs >= 0) {
    const delayMs = Math.round(vocalWallMs)
    vocalChain = `adelay=${delayMs}|${delayMs},volume=${vocalGain}`
  }
  else {
    const trimSeconds = -vocalWallMs / 1000
    vocalChain = `atrim=start=${trimSeconds.toFixed(6)},asetpts=PTS-STARTPTS,volume=${vocalGain}`
  }

  const onBacking = effectsReachBacking(effectsTarget)
  const onVocal = effectsReachVocal(effectsTarget)
  const backingReverb = onBacking ? reverbAmount : REVERB_AMOUNT_MIN
  const vocalReverb = onVocal ? reverbAmount : REVERB_AMOUNT_MIN

  // One impulse response input feeds at most two `afir`s, and a stream can be
  // consumed only once, so it is split when both sides want it.
  const backingWantsIr = backingReverb > REVERB_AMOUNT_MIN
  const vocalWantsIr = vocalReverb > REVERB_AMOUNT_MIN
  const irSegments: string[] = []
  let backingIr = '[2:a]'
  let vocalIr = '[2:a]'
  if (backingWantsIr && vocalWantsIr) {
    irSegments.push('[2:a]asplit=2[ir_bg][ir_voc]')
    backingIr = '[ir_bg]'
    vocalIr = '[ir_voc]'
  }

  const backingSegments: string[] = []
  const backingLabel = appendEffects(backingSegments, {
    label: '0:a',
    prefix: 'bg',
    reverbAmount: backingReverb,
    lowpassHz: onBacking ? lowpassHz : LOWPASS_HZ_MAX,
    impulseLabel: backingIr,
  })
  backingSegments.push(
    `[${backingLabel}]apad=whole_dur=${targetSeconds.toFixed(6)},atrim=end=${targetSeconds.toFixed(6)},`
    + `asetpts=PTS-STARTPTS,volume=${backingGain}[bg]`,
  )

  const vocalSegments = [`[1:a]${vocalChain}[voc]`]
  const vocalLabel = appendEffects(vocalSegments, {
    label: 'voc',
    prefix: 'voc',
    reverbAmount: vocalReverb,
    lowpassHz: onVocal ? lowpassHz : LOWPASS_HZ_MAX,
    impulseLabel: vocalIr,
  })

  const filterComplex = [
    ...irSegments,
    ...backingSegments,
    ...vocalSegments,
    `[bg][${vocalLabel}]amix=inputs=2:duration=first:normalize=0[out]`,
  ].join(';')

  return { filterComplex, wantsImpulseResponse: backingWantsIr || vocalWantsIr }
}

/**
 * Renders a Mix: the Backing Track stretched by Rubber Band, then the two
 * Effects, then the Take's dry vocal placed at `vocalWallMs` (already
 * converted from song time to wall time by the caller) and scaled by
 * `vocalGain`, summed with the backing scaled by `backingGain`. The result
 * always covers exactly `targetDurationMs` — the Backing Track's own duration
 * is padded or trimmed to it, since Rubber Band's extreme pitch shifts land a
 * few percent short of the input length on their own (ADR 0003, ADR 0004).
 *
 * The stretch is Rubber Band WebAssembly — the build and options the live
 * preview runs — in its own subprocess, not ffmpeg's `rubberband` filter; ffmpeg
 * only ever sees audio that is already stretched. Unadjusted, there is nothing
 * to stretch and the Backing Track goes to ffmpeg as it is.
 *
 * Ported from `worker/akapela_worker/audio.py`'s `render_mix` (ticket 04).
 */
export async function renderMix(options: RenderMixOptions): Promise<void> {
  const { backing, vocal, dstMp3, dstWav, tempo, pitch, signal } = options

  await mkdir(dirname(dstMp3), { recursive: true })

  const stretchedWav = dstMp3.replace(/\.mp3$/, '.stretched.part.wav')
  const decodedBackingWav = dstMp3.replace(/\.mp3$/, '.backing.part.wav')
  const tmpWav = dstMp3.replace(/\.mp3$/, '.part.wav')
  try {
    let backingInput = backing
    if (tempo !== 1 || pitch !== 1) {
      // The stretch reads WAV only; a master stored in another format is
      // decoded for it first. ffmpeg, below, reads every format as it is.
      let stretchInput = backing
      if (formatOfStored(backing) !== 'wav') {
        stretchInput = decodedBackingWav
        await decodeToWav(backing, decodedBackingWav, signal)
      }
      try {
        await runStretch(stretchInput, stretchedWav, 1 / tempo, pitch, signal)
      }
      catch (error) {
        throw error instanceof AudioError
          ? new AudioError(`Rubber Band could not stretch the Backing Track: ${error.message}`)
          : error
      }
      backingInput = stretchedWav
    }

    const { filterComplex, wantsImpulseResponse } = buildMixFilterGraph(options)
    const inputs = ['-i', backingInput, '-i', vocal]
    if (wantsImpulseResponse) inputs.push('-i', impulseResponsePath())

    try {
      await run('ffmpeg', [
        '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[out]',
        '-ar', String(BACKING_SAMPLE_RATE),
        '-ac', String(BACKING_CHANNELS),
        '-c:a', 'pcm_s16le',
        tmpWav,
      ], signal)
    }
    catch (error) {
      await rm(tmpWav, { force: true })
      throw error instanceof AudioError
        ? new AudioError(`ffmpeg could not render the Mix: ${error.message.replace(/^ffmpeg exited \d+: /, '')}`)
        : error
    }
  }
  finally {
    await rm(stretchedWav, { force: true })
    await rm(decodedBackingWav, { force: true })
  }

  const tmpMp3 = dstMp3.replace(/\.mp3$/, '.part.mp3')
  try {
    await run('ffmpeg', [
      '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-i', tmpWav,
      '-c:a', 'libmp3lame',
      '-b:a', '320k',
      tmpMp3,
    ], signal)
  }
  catch (error) {
    await rm(tmpWav, { force: true })
    await rm(tmpMp3, { force: true })
    throw error instanceof AudioError
      ? new AudioError(`ffmpeg could not encode the Mix to MP3: ${error.message.replace(/^ffmpeg exited \d+: /, '')}`)
      : error
  }
  await rename(tmpMp3, dstMp3)

  if (dstWav !== null) await rename(tmpWav, dstWav)
  else await rm(tmpWav, { force: true })
}
