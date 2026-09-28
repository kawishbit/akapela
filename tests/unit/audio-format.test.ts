import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeWav } from '../../app/audio/wav'
import {
  audioDurationMs,
  AudioError,
  decodeToWav,
  flacDurationMs,
  normalizeToBackingTrack,
  storeWavAs,
  wavDurationMs,
} from '../../server/lib/audio'
import { audioContentType, audioFormatOf, findAudioFile } from '../../server/lib/audio-files'
import { flacOf, probe, writeSineMp3, writeSineWav } from './audio-fixtures'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-format-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('flacDurationMs', () => {
  it('reads STREAMINFO to the same duration the WAV header gives the same audio', async () => {
    const wav = join(dir, 'a.wav')
    writeSineWav(wav, { seconds: 2.345 })
    flacOf(wav, join(dir, 'a.flac'))

    expect(await flacDurationMs(join(dir, 'a.flac'))).toBe(await wavDurationMs(wav))
    expect(await audioDurationMs(join(dir, 'a.flac'))).toBe(2345)
  })

  it('refuses a file that is not FLAC', async () => {
    writeFileSync(join(dir, 'fake.flac'), 'RIFF....WAVE')
    await expect(flacDurationMs(join(dir, 'fake.flac'))).rejects.toBeInstanceOf(AudioError)
  })
})

describe('storing in an Audio Format', () => {
  it('normalizes a Source straight to a FLAC Backing Track', async () => {
    writeSineMp3(join(dir, 'original.mp3'))
    await normalizeToBackingTrack(join(dir, 'original.mp3'), join(dir, 'backing.flac'))

    const info = probe(join(dir, 'backing.flac'))
    expect(info.streams[0]).toMatchObject({ codec_name: 'flac', sample_rate: '44100', channels: 2 })
  })

  it('keeps every sample of a 16-bit WAV through FLAC', async () => {
    writeSineWav(join(dir, 'stem.wav'), { seconds: 1, frequency: 330 })
    const before = readFileSync(join(dir, 'stem.wav'))
    writeFileSync(join(dir, 'copy.wav'), before)

    await storeWavAs(join(dir, 'copy.wav'), join(dir, 'stem.flac'))
    await decodeToWav(join(dir, 'stem.flac'), join(dir, 'back.wav'))

    expect(findAudioFile(dir, 'copy')).toBeNull()
    expect(decodeWav(readFileSync(join(dir, 'back.wav'))).channels).toEqual(decodeWav(before).channels)
  })

  it('only moves a WAV that is stored as WAV', async () => {
    writeSineWav(join(dir, 'stem.pcm.wav'), { seconds: 0.5 })
    const before = readFileSync(join(dir, 'stem.pcm.wav'))
    await storeWavAs(join(dir, 'stem.pcm.wav'), join(dir, 'stem.wav'))
    expect(readFileSync(join(dir, 'stem.wav'))).toEqual(before)
  })
})

describe('finding stored audio', () => {
  it('finds a file in whichever Audio Format it was written, and serves it as that', () => {
    writeFileSync(join(dir, 'instrumental.flac'), 'x')
    const found = findAudioFile(dir, 'instrumental')
    expect(found).toBe(join(dir, 'instrumental.flac'))
    expect(audioFormatOf(found!)).toBe('flac')
    expect(audioContentType(found!)).toBe('audio/flac')
    expect(audioContentType(join(dir, 'backing.wav'))).toBe('audio/wav')
  })

  it('finds nothing when there is nothing', () => {
    expect(findAudioFile(dir, 'vocals')).toBeNull()
  })
})
