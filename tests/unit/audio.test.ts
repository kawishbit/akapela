import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AudioError, normalizeToBackingTrack, probeDurationMs } from '../../server/lib/audio'
import { writeSineWav } from './audio-fixtures'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-audio-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('normalizeToBackingTrack', () => {
  it('decodes and resamples to 44.1kHz stereo 16-bit WAV', async () => {
    const src = join(dir, 'src.wav')
    const dst = join(dir, 'backing.wav')
    writeSineWav(src, { seconds: 1, sampleRate: 22050, channels: 1 })

    await normalizeToBackingTrack(src, dst)

    const probe = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=sample_rate,channels,codec_name', '-of', 'json', dst,
    ])
    const info = JSON.parse(probe.stdout.toString())
    expect(info.streams[0].codec_name).toBe('pcm_s16le')
    expect(info.streams[0].sample_rate).toBe('44100')
    expect(info.streams[0].channels).toBe(2)
  })

  it('creates the destination directory if needed', async () => {
    const src = join(dir, 'src.wav')
    writeSineWav(src)
    const dst = join(dir, 'nested', 'deeper', 'backing.wav')

    await normalizeToBackingTrack(src, dst)

    const durationMs = await probeDurationMs(dst)
    expect(durationMs).toBeGreaterThan(0)
  })

  it('rejects with a clean AudioError on input ffmpeg cannot decode', async () => {
    const src = join(dir, 'not-audio.txt')
    writeFileSync(src, 'this is not an audio file')
    const dst = join(dir, 'backing.wav')

    await expect(normalizeToBackingTrack(src, dst)).rejects.toBeInstanceOf(AudioError)
    // The [in#0 @ 0x...] context tag ffmpeg prefixes its diagnostics with is stripped.
    await expect(normalizeToBackingTrack(src, dst)).rejects.not.toThrow(/\[in#0/)
  })

  it('leaves no partial file behind on failure', async () => {
    const src = join(dir, 'not-audio.txt')
    writeFileSync(src, 'nope')
    const dst = join(dir, 'backing.wav')

    await expect(normalizeToBackingTrack(src, dst)).rejects.toThrow()

    const { existsSync } = await import('node:fs')
    expect(existsSync(dst)).toBe(false)
    expect(existsSync(dst.replace(/\.wav$/, '.part.wav'))).toBe(false)
  })
})

describe('probeDurationMs', () => {
  it('reports the duration of a real file, in milliseconds', async () => {
    const path = join(dir, 'two-seconds.wav')
    writeSineWav(path, { seconds: 2 })

    const durationMs = await probeDurationMs(path)

    expect(durationMs).toBeGreaterThan(1900)
    expect(durationMs).toBeLessThan(2100)
  })

  it('rejects with an AudioError for a file with no readable duration', async () => {
    const path = join(dir, 'garbage.wav')
    writeFileSync(path, 'not a wav file at all')

    await expect(probeDurationMs(path)).rejects.toBeInstanceOf(AudioError)
  })
})
