import * as ort from 'onnxruntime-node'
import { describe, expect, it } from 'vitest'
import { MdxNetModel, normalizePeak, type MdxNetConfig, type ModelSession } from '../../../server/lib/separators/mdx-net'

/** Small enough to run fast in CI; exercises the same chunking/windowing code paths as the real 6144/1024/3072/256 config. */
const SMALL_CONFIG: MdxNetConfig = { nFft: 512, hopLength: 128, dimF: 256, segmentSize: 32, overlap: 0.25 }

function sineSignal(length: number, frequency: number, sampleRate = 44100): Float64Array {
  const out = new Float64Array(length)
  for (let i = 0; i < length; i++) out[i] = 0.3 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  return out
}

/** A fake "model" that passes its input spectrogram straight through — everything but the ONNX call itself is under test. */
const identitySession: ModelSession = {
  run: async (feeds) => {
    const input = feeds.input!
    return { output: new ort.Tensor('float32', input.data as Float32Array, input.dims) }
  },
}

/** A fake model whose output is always silence, regardless of input. */
const silentSession: ModelSession = {
  run: async (feeds) => {
    const input = feeds.input!
    return { output: new ort.Tensor('float32', new Float32Array((input.data as Float32Array).length), input.dims) }
  },
}

describe('MdxNetModel', () => {
  it('reconstructs the input closely through demixPrimary with an identity model', async () => {
    const model = new MdxNetModel('unused', SMALL_CONFIG, identitySession)
    const length = SMALL_CONFIG.hopLength * (SMALL_CONFIG.segmentSize - 1) * 2
    const left = sineSignal(length, 440)
    const right = sineSignal(length, 660)

    const [outLeft, outRight] = await model.demixPrimary([left, right])

    expect(outLeft.length).toBe(length)
    expect(outRight.length).toBe(length)
    // The model changes nothing, so overlap-add should reconstruct closely —
    // a real, if coarse, check on the chunking/windowing math, not just the STFT alone.
    const margin = SMALL_CONFIG.nFft
    let maxErr = 0
    for (let i = margin; i < length - margin; i++) maxErr = Math.max(maxErr, Math.abs(outLeft[i]! - left[i]!))
    expect(maxErr).toBeLessThan(0.01)
  })

  it('produces silence end to end when the model always outputs silence', async () => {
    const model = new MdxNetModel('unused', SMALL_CONFIG, silentSession)
    const length = SMALL_CONFIG.hopLength * (SMALL_CONFIG.segmentSize - 1) * 2
    const left = sineSignal(length, 440)
    const right = sineSignal(length, 660)

    const [outLeft, outRight] = await model.demixPrimary([left, right])

    expect(Array.from(outLeft).every(v => v === 0)).toBe(true)
    expect(Array.from(outRight).every(v => v === 0)).toBe(true)
  })

  it('separateInstrumental normalizes, demixes, and rescales without blowing up the amplitude', async () => {
    const model = new MdxNetModel('unused', SMALL_CONFIG, identitySession)
    const length = SMALL_CONFIG.hopLength * (SMALL_CONFIG.segmentSize - 1) * 2
    const left = sineSignal(length, 440)
    const right = sineSignal(length, 660)

    const [outLeft, outRight] = await model.separateInstrumental([left, right])

    expect(outLeft.length).toBe(length)
    for (const v of outLeft) expect(Math.abs(v)).toBeLessThanOrEqual(1)
    for (const v of outRight) expect(Math.abs(v)).toBeLessThanOrEqual(1)
  })
})

describe('normalizePeak', () => {
  it('scales down to the max peak when exceeded', () => {
    const left = Float64Array.from([0.5, 1.0, -1.5])
    const right = Float64Array.from([0.2, -0.3, 0.1])

    normalizePeak([left, right], 0.9)

    expect(Math.max(...Array.from(left).map(Math.abs), ...Array.from(right).map(Math.abs))).toBeCloseTo(0.9, 6)
    expect(left[1]).toBeCloseTo((1.0 / 1.5) * 0.9, 6)
  })

  it('leaves audio alone when already under the max peak', () => {
    const left = Float64Array.from([0.1, 0.2, -0.3])
    const right = Float64Array.from([0.05, -0.1, 0.15])
    const beforeLeft = left.slice()
    const beforeRight = right.slice()

    normalizePeak([left, right], 0.9)

    expect(left).toEqual(beforeLeft)
    expect(right).toEqual(beforeRight)
  })
})
