import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import {
  effectsReachBacking,
  effectsReachVocal,
  LOWPASS_HZ_MAX,
  REVERB_AMOUNT_MIN,
  type EffectsTarget,
} from '../../shared/adjustments'

/**
 * Thin wrappers over ffmpeg and ffprobe, ported from `worker/akapela_worker/audio.py`
 * (ticket 03/04 of `.scratch/worker-to-typescript/`; ffmpeg was always just a
 * subprocess call, never a Python-specific dependency).
 *
 * Every stored audio master is 44.1 kHz stereo WAV (ADR 0005).
 */

export const BACKING_SAMPLE_RATE = 44100
export const BACKING_CHANNELS = 2

export class AudioError extends Error {}

/** Runs ffmpeg/ffprobe and rejects with `AudioError` on a non-zero exit. */
function run(bin: 'ffmpeg' | 'ffprobe', args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args)
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

/** Decodes any Source audio and writes it as the 44.1 kHz stereo 16-bit WAV Backing Track. */
export async function normalizeToBackingTrack(src: string, dst: string): Promise<void> {
  await mkdir(dirname(dst), { recursive: true })
  const tmp = dst.replace(/\.wav$/, '.part.wav')
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
      '-c:a',
      'pcm_s16le',
      tmp,
    ])
  }
  catch (error) {
    await rm(tmp, { force: true })
    throw error instanceof AudioError
      ? new AudioError(`ffmpeg could not decode ${src}: ${error.message.replace(/^ffmpeg exited \d+: /, '')}`)
      : error
  }
  await rename(tmp, dst)
}

/** The duration of an audio file, in milliseconds. */
export async function probeDurationMs(path: string): Promise<number> {
  let stdout: string
  try {
    stdout = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      path,
    ])
  }
  catch (error) {
    throw error instanceof AudioError
      ? new AudioError(`ffprobe could not read ${path}: ${error.message.replace(/^ffprobe exited \d+: /, '')}`)
      : error
  }
  const seconds = Number(JSON.parse(stdout)?.format?.duration)
  if (!Number.isFinite(seconds)) throw new AudioError(`ffprobe reported no duration for ${path}`)
  return Math.round(seconds * 1000)
}

/**
 * The one impulse response ADR 0003 requires both engines to share; the
 * browser's `app/audio/engine.ts` loads the same file from `public/audio/`.
 * Resolved by checking the built output first rather than assuming a `cwd`:
 * `pnpm dev` serves straight from `public/`, the compose image serves the
 * copy Nuxt's build already puts in `.output/public/` next to it.
 */
function impulseResponsePath(): string {
  const built = resolve('.output/public/audio/large-hall-ir.wav')
  return existsSync(built) ? built : resolve('public/audio/large-hall-ir.wav')
}

export interface RenderMixOptions {
  backing: string
  vocal: string
  dstMp3: string
  dstWav: string | null
  tempo: number
  pitch: number
  vocalWallMs: number
  vocalGain: number
  backingGain: number
  targetDurationMs: number
  reverbAmount?: number
  lowpassHz?: number
  effectsTarget?: EffectsTarget
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

/**
 * Renders a Mix: the Backing Track stretched by Rubber Band, then the two
 * Effects, then the Take's dry vocal placed at `vocalWallMs` (already
 * converted from song time to wall time by the caller) and scaled by
 * `vocalGain`, summed with the backing scaled by `backingGain`. The result
 * always covers exactly `targetDurationMs` — the Backing Track's own duration
 * is padded or trimmed to it, since Rubber Band's extreme pitch shifts land a
 * few percent short of the input length on their own (ADR 0003, ADR 0004).
 *
 * Ported from `worker/akapela_worker/audio.py`'s `render_mix` (ticket 04).
 */
export async function renderMix(options: RenderMixOptions): Promise<void> {
  const {
    backing, vocal, dstMp3, dstWav, tempo, pitch, vocalWallMs, vocalGain, backingGain, targetDurationMs,
    reverbAmount = REVERB_AMOUNT_MIN, lowpassHz = LOWPASS_HZ_MAX, effectsTarget = 'backing',
  } = options

  await mkdir(dirname(dstMp3), { recursive: true })
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

  const backingSegments = [`[0:a]rubberband=tempo=${tempo}:pitch=${pitch}[stretched]`]
  const backingLabel = appendEffects(backingSegments, {
    label: 'stretched',
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

  const inputs = ['-i', backing, '-i', vocal]
  if (backingWantsIr || vocalWantsIr) inputs.push('-i', impulseResponsePath())

  const tmpWav = dstMp3.replace(/\.mp3$/, '.part.wav')
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
    ])
  }
  catch (error) {
    await rm(tmpWav, { force: true })
    throw error instanceof AudioError
      ? new AudioError(`ffmpeg could not render the Mix: ${error.message.replace(/^ffmpeg exited \d+: /, '')}`)
      : error
  }

  const tmpMp3 = dstMp3.replace(/\.mp3$/, '.part.mp3')
  try {
    await run('ffmpeg', [
      '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-i', tmpWav,
      '-c:a', 'libmp3lame',
      '-b:a', '320k',
      tmpMp3,
    ])
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
