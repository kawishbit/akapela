import { describe, expect, test } from 'vitest'
import { decodeWav, encodeWav } from '../../app/audio/wav'

function sine(frames: number, hz: number, sampleRate: number): Float32Array {
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) samples[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate) * 0.5
  return samples
}

describe('encodeWav', () => {
  test('writes the RIFF/WAVE header fields for mono 16-bit PCM', () => {
    const channels = [new Float32Array([0, 0.5, -0.5, 1, -1])]
    const bytes = encodeWav({ channels, sampleRate: 48_000 })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8)
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(ascii(view, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(48_000)
    expect(view.getUint32(28, true)).toBe(48_000 * 2) // byte rate: sampleRate * blockAlign
    expect(view.getUint16(32, true)).toBe(2) // block align
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
    expect(ascii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(5 * 2)
  })

  test('interleaves stereo channels and reports the right header fields', () => {
    const left = new Float32Array([1, -1, 0])
    const right = new Float32Array([0.5, -0.5, 0.25])
    const bytes = encodeWav({ channels: [left, right], sampleRate: 44_100 })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint16(32, true)).toBe(4) // block align: 2 channels * 2 bytes
    expect(view.getUint32(40, true)).toBe(3 * 4) // data bytes: 3 frames * block align

    const dataOffset = 44
    expect(view.getInt16(dataOffset + 0, true)).toBe(0x7fff) // left frame 0
    expect(view.getInt16(dataOffset + 2, true)).toBe(0x4000) // right frame 0 (0.5 * 0x8000)
  })

  test('the sample count matches the input, in bytes and in frames read back', () => {
    const frames = 1000
    const bytes = encodeWav({ channels: [sine(frames, 440, 48_000)], sampleRate: 48_000 })
    expect(bytes.byteLength).toBe(44 + frames * 2)
    expect(decodeWav(bytes).channels[0]).toHaveLength(frames)
  })

  test('an empty take encodes a header with zero-length data', () => {
    const bytes = encodeWav({ channels: [new Float32Array(0)], sampleRate: 48_000 })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(bytes.byteLength).toBe(44)
    expect(view.getUint32(40, true)).toBe(0)
  })
})

describe('round trip through encodeWav and decodeWav', () => {
  test('mono samples survive within 16-bit quantization error', () => {
    const original = sine(2000, 220, 44_100)
    const decoded = decodeWav(encodeWav({ channels: [original], sampleRate: 44_100 }))

    expect(decoded.sampleRate).toBe(44_100)
    expect(decoded.channels).toHaveLength(1)
    for (let i = 0; i < original.length; i++) {
      expect(decoded.channels[0]![i]).toBeCloseTo(original[i]!, 4)
    }
  })

  test('stereo channel order and sample values round-trip', () => {
    const left = new Float32Array([1, -1, 0, 0.25, -0.75])
    const right = new Float32Array([-1, 1, 0, -0.25, 0.75])
    const decoded = decodeWav(encodeWav({ channels: [left, right], sampleRate: 48_000 }))

    expect(decoded.channels).toHaveLength(2)
    for (let i = 0; i < left.length; i++) {
      expect(decoded.channels[0]![i]).toBeCloseTo(left[i]!, 4)
      expect(decoded.channels[1]![i]).toBeCloseTo(right[i]!, 4)
    }
  })

  test('rejects a non-WAV buffer', () => {
    expect(() => decodeWav(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })
})

function ascii(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i))
  return text
}
