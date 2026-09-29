import * as ort from 'onnxruntime-node'
// Explicit extension: this module also runs as a standalone `node` subprocess
// (`separate-cli.ts`, for CPU isolation), which needs it — plain Node's ESM
// resolver, unlike Nitro/Vite's bundler, requires one for a relative import.
import { Stft, type Spectrogram } from './stft.ts'
import { SEPARATION_MODELS, type MdxNetConfig } from './models.ts'

/**
 * The MDX-Net inference pipeline: chunking, the ONNX model call, and
 * overlap-add reconstruction. Ported from `mdx_separator.py`'s `demix` and
 * `run_model` (ticket 05, `.scratch/worker-to-typescript/`). Which model runs,
 * and every number that shapes its chunks, comes from the catalog in
 * `models.ts`, where each is checked against the registry and the model's own
 * graph.
 */
export type { MdxNetConfig }

export const UVR_MDX_NET_INST_MAIN_CONFIG: MdxNetConfig = SEPARATION_MODELS.Inst_Main.config

/** `numpy.hanning`: the symmetric convention (divides by `length - 1`), distinct from `torch.hann_window`'s periodic one the STFT class uses internally. */
function hanningSymmetric(length: number): Float64Array {
  if (length <= 1) return new Float64Array(length).fill(1)
  const window = new Float64Array(length)
  for (let n = 0; n < length; n++) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1))
  return window
}

function peakOf(channels: [Float64Array, Float64Array]): number {
  let peak = 0
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample))
  }
  return peak
}

/** In place: scales `channels` down to `maxPeak` if their combined peak exceeds it. Never amplifies (this app's `amplification_threshold` is always 0). */
export function normalizePeak(channels: [Float64Array, Float64Array], maxPeak = 0.9): void {
  const peak = peakOf(channels)
  if (peak > maxPeak) {
    const scale = maxPeak / peak
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) channel[i]! *= scale
    }
  }
}

/** The one method this module actually calls on a session — small enough that a test can fake it without touching onnxruntime at all. */
export interface ModelSession {
  run: (feeds: Record<string, ort.Tensor>) => Promise<Record<string, ort.Tensor>>
}

export interface SeparationProgressOptions {
  /** Called after each chunk's model call, with how many are done out of how many there are. */
  onChunk?: (done: number, total: number) => void
}

export class MdxNetModel {
  private readonly config: MdxNetConfig
  private readonly session: ModelSession
  private readonly stft: Stft

  /**
   * `session` is the ONNX model, or in a test a fake that stands in for it
   * (`worker/tests/test_separate.py`'s `FakeSeparator` did the equivalent for
   * the Python side) so the chunking/overlap-add math can be checked without
   * the real 66MB model. `separate-cli.ts` builds the real one (`session.ts`).
   */
  constructor(config: MdxNetConfig, session: ModelSession) {
    this.config = config
    this.session = session
    this.stft = new Stft(config.nFft, config.hopLength, config.dimF)
  }

  /** A chunk as the model takes it: its STFT, with the first 3 (near-DC) bins zeroed, in float32. */
  private modelInput(chunk: [Float64Array, Float64Array]): ort.Tensor {
    const { data, dimF, nFrames } = this.stft.forward(chunk)
    for (let channel = 0; channel < 4; channel++) {
      for (let f = 0; f < 3; f++) {
        for (let t = 0; t < nFrames; t++) data[channel * dimF * nFrames + f * nFrames + t] = 0
      }
    }
    return new ort.Tensor('float32', Float32Array.from(data), [1, 4, dimF, nFrames])
  }

  /** The model's output for one chunk, back in the time domain. */
  private modelOutput(results: Record<string, ort.Tensor>): [Float64Array, Float64Array] {
    const output = results.output
    if (!output) throw new Error('the model produced no "output" tensor')
    const [, , dimF, nFrames] = output.dims as number[]
    const outSpec: Spectrogram = { data: Float64Array.from(output.data as Float32Array), dimF: dimF!, nFrames: nFrames! }
    return this.stft.inverse(outSpec)
  }

  /**
   * The model's primary output (Instrumental, for this model) over the whole
   * mix: chunked with overlap, each chunk run through the model, crossfaded
   * back together with a Hanning window exactly the way `demix` does it.
   */
  async demixPrimary(
    mix: [Float64Array, Float64Array],
    options: SeparationProgressOptions = {},
  ): Promise<[Float64Array, Float64Array]> {
    const { nFft, hopLength, segmentSize, overlap } = this.config
    const trim = nFft / 2
    const chunkSize = hopLength * (segmentSize - 1)
    const genSize = chunkSize - 2 * trim
    const originalLength = mix[0].length

    const pad = genSize + trim - (originalLength % genSize)
    const paddedLength = trim + originalLength + pad
    const mixture: [Float64Array, Float64Array] = [new Float64Array(paddedLength), new Float64Array(paddedLength)]
    mixture[0].set(mix[0], trim)
    mixture[1].set(mix[1], trim)

    const step = Math.floor((1 - overlap) * chunkSize)
    const result: [Float64Array, Float64Array] = [new Float64Array(paddedLength), new Float64Array(paddedLength)]
    const divider: [Float64Array, Float64Array] = [new Float64Array(paddedLength), new Float64Array(paddedLength)]

    const starts: number[] = []
    for (let start = 0; start < paddedLength; start += step) starts.push(start)
    const totalChunks = starts.length

    const chunkAt = (start: number): [Float64Array, Float64Array] => {
      const end = Math.min(start + chunkSize, paddedLength)
      const left = new Float64Array(chunkSize)
      const right = new Float64Array(chunkSize)
      left.set(mixture[0].subarray(start, end))
      right.set(mixture[1].subarray(start, end))
      return [left, right]
    }

    const overlapAdd = (start: number, [tarLeft, tarRight]: [Float64Array, Float64Array]) => {
      const actualSize = Math.min(start + chunkSize, paddedLength) - start
      const window = overlap !== 0 ? hanningSymmetric(actualSize) : null
      for (let n = 0; n < actualSize; n++) {
        const w = window ? window[n]! : 1
        result[0]![start + n]! += tarLeft[n]! * w
        result[1]![start + n]! += tarRight[n]! * w
        divider[0]![start + n]! += w
        divider[1]![start + n]! += w
      }
    }

    // One chunk at a time, start to finish. Each is a full inference, and two
    // at once would double peak memory for nothing. Nor does the STFT of the
    // next chunk overlap this one's model call: onnxruntime-node's `run`
    // executes on the calling thread (its promise only wraps a synchronous
    // native call), so overlapping them needs a worker thread, and once the
    // STFT stopped being Bluestein it was under a tenth of a CPU Separation —
    // too little to pay for one (ticket 08 of `.scratch/faster-separation/`).
    for (const [i, start] of starts.entries()) {
      const results = await this.session.run({ input: this.modelInput(chunkAt(start)) })
      overlapAdd(start, this.modelOutput(results))
      options.onChunk?.(i + 1, totalChunks)
    }

    const out: [Float64Array, Float64Array] = [new Float64Array(originalLength), new Float64Array(originalLength)]
    for (let channel = 0; channel < 2; channel++) {
      for (let n = 0; n < originalLength; n++) {
        const idx = trim + n
        const denom = divider[channel]![idx]!
        out[channel]![n] = denom > 0 ? result[channel]![idx]! / denom : 0
      }
    }
    return out
  }

  /**
   * The Instrumental Stem alone. For a model whose primary output is the
   * Vocals Stem, that is still the subtraction `separate` does.
   */
  async separateInstrumental(mix: [Float64Array, Float64Array]): Promise<[Float64Array, Float64Array]> {
    return (await this.separate(mix)).instrumental
  }

  /**
   * Both Stems. The primary one is the model's own output: normalize before
   * demixing (never amplifies, only prevents clipping), demix, then rescale by
   * the mix's original peak — mirroring `MDXSeparator.separate`'s
   * `demix(mix) * peak` exactly, arithmetic quirk and all: the original
   * multiplies by the raw peak rather than `peak / max_peak`, so this does too
   * rather than "fixing" a widely-used, community-vetted implementation this is
   * meant to reproduce. A final normalize matches `write_audio`'s own pass.
   *
   * The secondary Stem is everything the primary didn't account for,
   * computed as a time-domain subtraction against the (peak-normalized, not
   * rescaled) mix — `MDXSeparator.separate`'s `invert_using_spec=False`
   * branch, which is what these models run under. The `is_match_mix=True`
   * demix pass Python's code also runs before that branch only feeds the
   * `invert_using_spec=True` one, so it is skipped here.
   *
   * Which is which is the model's `primaryStem`: the Instrumental for the
   * `Inst_` models, the Vocals for `Kim_Vocal_2`.
   */
  async separate(mix: [Float64Array, Float64Array], options: SeparationProgressOptions = {}): Promise<{
    instrumental: [Float64Array, Float64Array]
    vocals: [Float64Array, Float64Array]
  }> {
    const peak = peakOf(mix)
    const normalizedMix: [Float64Array, Float64Array] = [mix[0].slice(), mix[1].slice()]
    normalizePeak(normalizedMix, 0.9)

    const demixed = await this.demixPrimary(normalizedMix, options)
    const primary: [Float64Array, Float64Array] = [
      demixed[0].map(v => v * peak),
      demixed[1].map(v => v * peak),
    ]
    normalizePeak(primary, 0.9)

    const { compensate, primaryStem } = this.config
    const secondary: [Float64Array, Float64Array] = [
      new Float64Array(normalizedMix[0].length),
      new Float64Array(normalizedMix[1].length),
    ]
    for (let channel = 0; channel < 2; channel++) {
      for (let n = 0; n < secondary[channel]!.length; n++) {
        secondary[channel]![n] = -primary[channel]![n]! * compensate + normalizedMix[channel]![n]!
      }
    }
    normalizePeak(secondary, 0.9)

    return primaryStem === 'instrumental'
      ? { instrumental: primary, vocals: secondary }
      : { instrumental: secondary, vocals: primary }
  }
}
