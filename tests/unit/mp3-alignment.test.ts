import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeWav } from '../../app/audio/wav'
import { audioDurationMs, decodeToWav, mp3DurationMs, storeWavAs, wavDurationMs } from '../../server/lib/audio'


/**
 * The gate ADR 0016 puts on MP3: a master or Stem stored as MP3 must decode
 * back onto the same sample grid as the WAV it came from, or every Take sung
 * over it lands late by the encoder delay. Checked through ffmpeg, which is
 * how the render reads it. The browser's `decodeAudioData` was checked by hand
 * (ticket 07's Comments); there is no browser harness to hold it here.
 */

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-mp3-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * A rising chirp, an odd number of samples long: no two stretches of it look
 * alike, so there is only one offset it lines up at.
 */
function chirp(path: string) {
  const result = spawnSync('ffmpeg', [
    '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*(200+300*t)*t):s=44100:d=3.217',
    '-ac', '2', '-c:a', 'pcm_s16le', path,
  ])
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${result.stderr}`)
}

/** Bit rate and codec, which `probe` in the shared fixtures doesn't ask for. */
function probeCodec(path: string): { codec_name: string, bit_rate: string } {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,bit_rate', '-of', 'json', path])
  return JSON.parse(result.stdout.toString()).streams[0]
}

function bestLag(a: Float32Array, b: Float32Array, range = 3000): number {
  let best = -Infinity
  let lag = 0
  for (let l = -range; l <= range; l++) {
    let sum = 0
    for (let i = range; i < a.length - range; i += 4) sum += a[i]! * (b[i + l] ?? 0)
    if (sum > best) {
      best = sum
      lag = l
    }
  }
  return lag
}

describe('MP3 at 320 kbps CBR', () => {
  it('decodes onto the source WAV sample for sample in length and offset', async () => {
    const source = join(dir, 'source.wav')
    chirp(source)
    writeFileSync(join(dir, 'copy.wav'), readFileSync(source))

    await storeWavAs(join(dir, 'copy.wav'), join(dir, 'stem.mp3'))
    await decodeToWav(join(dir, 'stem.mp3'), join(dir, 'decoded.wav'))

    const original = decodeWav(readFileSync(source)).channels[0]!
    const decoded = decodeWav(readFileSync(join(dir, 'decoded.wav'))).channels[0]!
    expect(decoded.length).toBe(original.length)
    expect(bestLag(original, decoded)).toBe(0)
  })

  it('is stored as 320 kbps CBR with an Info frame', async () => {
    const source = join(dir, 'source.wav')
    chirp(source)
    await storeWavAs(source, join(dir, 'stem.mp3'))

    expect(probeCodec(join(dir, 'stem.mp3'))).toEqual({ codec_name: 'mp3', bit_rate: '320000' })
    expect(readFileSync(join(dir, 'stem.mp3')).includes('Info')).toBe(true)
  })

  it('reads its duration from the Info frame as exactly the source\u2019s', async () => {
    const source = join(dir, 'source.wav')
    chirp(source)
    const expected = await wavDurationMs(source)
    await storeWavAs(source, join(dir, 'stem.mp3'))

    expect(await mp3DurationMs(join(dir, 'stem.mp3'))).toBe(expected)
    expect(await audioDurationMs(join(dir, 'stem.mp3'))).toBe(expected)
  })
})
