import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWav } from '../../app/audio/wav'
import { AudioError, impulseResponsePath, normalizeToBackingTrack, wavDurationMs } from '../../server/lib/audio'
import { writeSineWav } from './audio-fixtures'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-audio-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('impulseResponsePath', () => {
  const before = process.env.AKAPELA_PUBLIC_DIR

  afterEach(() => {
    if (before === undefined) delete process.env.AKAPELA_PUBLIC_DIR
    else process.env.AKAPELA_PUBLIC_DIR = before
  })

  // The desktop shell's server is a child of Electron and inherits whatever
  // directory the app was launched from, so the cwd-relative answer below is
  // wrong there and a Mix with any reverb fails on a path built out of thin
  // air. Nothing else sets this, which is what keeps compose and `pnpm dev`
  // on the behaviour they already had.
  it('takes the public directory from the environment when the shell sets one', () => {
    process.env.AKAPELA_PUBLIC_DIR = join(dir, 'resources', 'output', 'public')

    expect(impulseResponsePath()).toBe(join(dir, 'resources', 'output', 'public', 'audio', 'large-hall-ir.wav'))
  })

  it('falls back to the cwd-relative copy when nothing sets one', () => {
    delete process.env.AKAPELA_PUBLIC_DIR

    expect(impulseResponsePath().endsWith(join('public', 'audio', 'large-hall-ir.wav'))).toBe(true)
  })

  it('ignores an override set to whitespace rather than building a path out of it', () => {
    process.env.AKAPELA_PUBLIC_DIR = '   '

    expect(impulseResponsePath().endsWith(join('public', 'audio', 'large-hall-ir.wav'))).toBe(true)
  })
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

    const durationMs = await wavDurationMs(dst)
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

describe('wavDurationMs', () => {
  it('reports the duration of a WAV ffmpeg wrote, in milliseconds', async () => {
    const path = join(dir, 'two-seconds.wav')
    writeSineWav(path, { seconds: 2 })

    expect(await wavDurationMs(path)).toBe(2000)
  })

  it('reads past the chunks ffmpeg writes ahead of the audio', async () => {
    const path = join(dir, 'tagged.wav')
    const result = spawnSync('ffmpeg', [
      '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5',
      '-metadata', 'title=A title long enough to need its own LIST chunk',
      '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', path,
    ])
    expect(result.status).toBe(0)

    expect(await wavDurationMs(path)).toBe(1500)
  })

  it('reports the duration of a Stem the separation wrote', async () => {
    const path = join(dir, 'instrumental.wav')
    const frames = 44100 * 3
    writeFileSync(path, encodeWav({ channels: [new Float32Array(frames), new Float32Array(frames)], sampleRate: 44100 }))

    expect(await wavDurationMs(path)).toBe(3000)
  })

  it('agrees with ffprobe, which it replaces', async () => {
    const path = join(dir, 'odd-length.wav')
    writeSineWav(path, { seconds: 2.3456, sampleRate: 22050, channels: 1 })

    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path])
    const probedMs = Math.round(Number(JSON.parse(probe.stdout.toString()).format.duration) * 1000)

    expect(await wavDurationMs(path)).toBe(probedMs)
  })

  it('rejects with an AudioError for a file with no readable duration', async () => {
    const path = join(dir, 'garbage.wav')
    writeFileSync(path, 'not a wav file at all')

    await expect(wavDurationMs(path)).rejects.toBeInstanceOf(AudioError)
  })

  it('rejects with an AudioError for a WAV with no audio chunk', async () => {
    const path = join(dir, 'header-only.wav')
    writeFileSync(path, encodeWav({ channels: [new Float32Array(10)], sampleRate: 44100 }).subarray(0, 36))

    await expect(wavDurationMs(path)).rejects.toBeInstanceOf(AudioError)
  })
})
