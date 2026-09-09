import { describe, expect, it } from 'vitest'
import { Stft } from '../../../server/lib/separators/stft'

function sineSignal(length: number, frequency: number, sampleRate = 44100): Float64Array {
  const out = new Float64Array(length)
  for (let i = 0; i < length; i++) out[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  return out
}

describe('Stft', () => {
  it('reconstructs a signal near-exactly through forward + inverse (identity round trip)', () => {
    // Small enough to run fast: n_fft=512, hop=128, a handful of frames.
    const stft = new Stft(512, 128, 257)
    const length = 128 * 20
    const left = sineSignal(length, 440)
    const right = sineSignal(length, 660)

    const spec = stft.forward([left, right])
    const [outLeft, outRight] = stft.inverse(spec)

    // The reconstructed signal is shorter than the padded internal buffer by
    // design (only the region every frame's window fully covers is well
    // normalized) — compare the well-covered middle region.
    const margin = 512
    let maxErrLeft = 0
    let maxErrRight = 0
    for (let i = margin; i < length - margin; i++) {
      maxErrLeft = Math.max(maxErrLeft, Math.abs(outLeft[i]! - left[i]!))
      maxErrRight = Math.max(maxErrRight, Math.abs(outRight[i]! - right[i]!))
    }
    expect(maxErrLeft).toBeLessThan(1e-6)
    expect(maxErrRight).toBeLessThan(1e-6)
  })

  it('reconstructs the exact chunk size and frame count the real MDX model uses', () => {
    // n_fft=6144, hop=1024, dim_f=3072, chunk_size=hop*(256-1)=261120 — the
    // real config probed from the live UVR-MDX-NET-Inst_HQ_3 model.
    const nFft = 6144
    const hop = 1024
    const dimF = 3072
    const chunkSize = hop * (256 - 1)
    const stft = new Stft(nFft, hop, dimF)
    const left = sineSignal(chunkSize, 220)
    const right = sineSignal(chunkSize, 330)

    const spec = stft.forward([left, right])
    expect(spec.nFrames).toBe(256)
    expect(spec.dimF).toBe(3072)

    const [outLeft] = stft.inverse(spec)
    expect(outLeft.length).toBe(chunkSize)
  }, 30_000)
})
