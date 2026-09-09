import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'

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
