import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

/** A sine-wave WAV, for tests that need real, valid audio without a network. */
export function writeSineWav(
  path: string,
  { frequency = 440, seconds = 2, sampleRate = 44100, channels = 2 } = {},
): void {
  mkdirSync(dirname(path), { recursive: true })
  const result = spawnSync('ffmpeg', [
    '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${seconds}`,
    '-ar', String(sampleRate), '-ac', String(channels), '-c:a', 'pcm_s16le', path,
  ])
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${result.stderr}`)
}

/** A short, deliberately off-spec sine-wave mp3, so normalization has real work to do. */
export function writeSineMp3(
  path: string,
  { seconds = 2, sampleRate = 22050, channels = 1 } = {},
): void {
  mkdirSync(dirname(path), { recursive: true })
  const result = spawnSync('ffmpeg', [
    '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-ar', String(sampleRate), '-ac', String(channels), '-c:a', 'libmp3lame', '-b:a', '64k', path,
  ])
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${result.stderr}`)
}

/**
 * A short tone followed by silence out to `totalSeconds`, so a window after
 * the burst is where dry silence and a reverb tail tell apart.
 */
export function writeBurstThenSilenceWav(
  path: string,
  { frequency, burstSeconds, totalSeconds, sampleRate = 44100 }: {
    frequency: number
    burstSeconds: number
    totalSeconds: number
    sampleRate?: number
  },
): void {
  mkdirSync(dirname(path), { recursive: true })
  const result = spawnSync('ffmpeg', [
    '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${burstSeconds}`,
    '-f', 'lavfi', '-i', `anullsrc=r=${sampleRate}:cl=stereo:d=${totalSeconds - burstSeconds}`,
    '-filter_complex', '[0:a]aformat=channel_layouts=stereo[a0];[a0][1:a]concat=n=2:v=0:a=1[cat]',
    '-map', '[cat]',
    '-ar', String(sampleRate), '-ac', '2', '-c:a', 'pcm_s16le', path,
  ])
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${result.stderr}`)
}

export interface ProbeInfo {
  format: { duration: string }
  streams: { sample_rate: string, channels: number, codec_name: string }[]
}

export function probe(path: string): ProbeInfo {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels,codec_name', '-of', 'json', path,
  ])
  return JSON.parse(result.stdout.toString())
}
