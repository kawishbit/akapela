import * as ort from 'onnxruntime-node'
// Explicit extension: this module also runs as a standalone `node` subprocess
// (`separate-cli.ts`, for CPU isolation), which needs it — plain Node's ESM
// resolver, unlike Nitro/Vite's bundler, requires one for a relative import.
import { Stft, type Spectrogram } from './stft.ts'

/**
 * The MDX-Net inference pipeline: chunking, the ONNX model call, and
 * overlap-add reconstruction. Ported from `mdx_separator.py`'s `demix` and
 * `run_model` (ticket 05, `.scratch/worker-to-typescript/`) for the model's
 * primary output only — for UVR-MDX-NET-Inst_HQ_3 that is the Instrumental
 * Stem, which is the only one this ticket validates. The Vocals Stem (the
 * model's secondary output, a time-domain subtraction against the primary)
 * is ticket 06's concern once this is trusted.
 *
 * Config values below were read directly off the real, downloaded model —
 * not guessed: its ONNX graph declares input/output shape
 * `[batch, 4, 3072, 256]`, and `Separator`'s resolved `model_data` for it is
 * `{ n_fft: 6144, dim_f: 3072, dim_t: 256 (2**8), hop_length: 1024,
 * overlap: 0.25, compensate: 1.022 }` (`compensate` only matters for the
 * Vocals side). Captured via a real `fetch_model` + `separate()` run against
 * the live Python path, whose fingerprint this port is checked against.
 */
export interface MdxNetConfig {
  nFft: number
  hopLength: number
  dimF: number
  segmentSize: number
  overlap: number
  /** Only used computing the Vocals Stem — a scalar correction on the Instrumental subtracted from the mix. */
  compensate: number
}

export const UVR_MDX_NET_INST_HQ_3_CONFIG: MdxNetConfig = {
  nFft: 6144,
  hopLength: 1024,
  dimF: 3072,
  segmentSize: 256,
  overlap: 0.25,
  compensate: 1.022,
}

/** `numpy.hanning`: the symmetric convention (divides by `length - 1`), distinct from `torch.hann_window`'s periodic one the STFT class uses internally. */
function hanningSymmetric(length: number): Float64Array {
  if (length <= 1) return new Float64Array(length).fill(1)
  const window = new Float64Array(length)
  for (let n = 0; n < length; n++) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1))
  return window
}

/** In place: scales `channels` down to `maxPeak` if their combined peak exceeds it. Never amplifies (this app's `amplification_threshold` is always 0). */
export function normalizePeak(channels: [Float64Array, Float64Array], maxPeak = 0.9): void {
  let peak = 0
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample))
  }
  if (peak > maxPeak) {
    const scale = maxPeak / peak
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) channel[i]! *= scale
    }
  }
}

function peakOf(channels: [Float64Array, Float64Array]): number {
  let peak = 0
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample))
  }
  return peak
}

/** The one method this module actually calls on a session — small enough that a test can fake it without touching onnxruntime at all. */
export interface ModelSession {
  run: (feeds: Record<string, ort.Tensor>) => Promise<Record<string, ort.Tensor>>
}

export class MdxNetModel {
  private readonly modelPath: string
  private readonly config: MdxNetConfig
  private session: ModelSession | undefined
  private readonly stft: Stft

  /**
   * `session` is for tests: inject a fake that stands in for the ONNX model
   * (`worker/tests/test_separate.py`'s `FakeSeparator` does the equivalent
   * for the Python side) so the chunking/overlap-add math can be checked
   * without the real 66MB model. Production code never passes it — the real
   * session loads lazily from `modelPath` on first use.
   */
  constructor(modelPath: string, config: MdxNetConfig = UVR_MDX_NET_INST_HQ_3_CONFIG, session?: ModelSession) {
    this.modelPath = modelPath
    this.config = config
    this.session = session
    this.stft = new Stft(config.nFft, config.hopLength, config.dimF)
  }

  private async session_(): Promise<ModelSession> {
    this.session ??= await ort.InferenceSession.create(this.modelPath)
    return this.session
  }

  /** One model call: STFT the chunk, zero the first 3 (near-DC) bins, run the ONNX graph, inverse-STFT the result. */
  private async runModel(chunk: [Float64Array, Float64Array]): Promise<[Float64Array, Float64Array]> {
    const spek = this.stft.forward(chunk)
    const { data, dimF, nFrames } = spek
    for (let channel = 0; channel < 4; channel++) {
      for (let f = 0; f < 3; f++) {
        for (let t = 0; t < nFrames; t++) data[channel * dimF * nFrames + f * nFrames + t] = 0
      }
    }

    const session = await this.session_()
    const inputTensor = new ort.Tensor('float32', Float32Array.from(data), [1, 4, dimF, nFrames])
    const results = await session.run({ input: inputTensor })
    const output = results.output
    if (!output) throw new Error('the model produced no "output" tensor')

    const outSpec: Spectrogram = { data: Float64Array.from(output.data as Float32Array), dimF, nFrames }
    return this.stft.inverse(outSpec)
  }

  /**
   * The model's primary output (Instrumental, for this model) over the whole
   * mix: chunked with overlap, each chunk run through the model, crossfaded
   * back together with a Hanning window exactly the way `demix` does it.
   */
  async demixPrimary(mix: [Float64Array, Float64Array]): Promise<[Float64Array, Float64Array]> {
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

    for (let start = 0; start < paddedLength; start += step) {
      const end = Math.min(start + chunkSize, paddedLength)
      const actualSize = end - start
      const window = overlap !== 0 ? hanningSymmetric(actualSize) : null

      const chunkLeft = new Float64Array(chunkSize)
      const chunkRight = new Float64Array(chunkSize)
      chunkLeft.set(mixture[0].subarray(start, end))
      chunkRight.set(mixture[1].subarray(start, end))

      // Chunks are inherently sequential: each is a full model inference, and
      // running them concurrently would multiply peak memory for no benefit
      // on a machine sized for one CPU inference at a time.
      const [tarLeft, tarRight] = await this.runModel([chunkLeft, chunkRight])

      for (let n = 0; n < actualSize; n++) {
        const w = window ? window[n]! : 1
        result[0]![start + n]! += tarLeft[n]! * w
        result[1]![start + n]! += tarRight[n]! * w
        divider[0]![start + n]! += w
        divider[1]![start + n]! += w
      }
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
   * The full Instrumental path: normalize before demixing (never amplifies,
   * only prevents clipping), demix, then rescale by the mix's own original
   * peak — mirroring `MDXSeparator.separate`'s `demix(mix) * peak` exactly,
   * arithmetic quirk and all: the original code multiplies by the raw peak
   * rather than `peak / max_peak`, so this does too rather than "fixing" a
   * widely-used, community-vetted implementation this is meant to reproduce.
   * A final normalize matches `write_audio`'s own pre-write pass.
   */
  async separateInstrumental(mix: [Float64Array, Float64Array]): Promise<[Float64Array, Float64Array]> {
    return (await this.separate(mix)).instrumental
  }

  /**
   * Both Stems. The Vocals Stem is the model's secondary output — for this
   * model, everything the Instrumental didn't account for — computed as a
   * time-domain subtraction against the (peak-normalized, not rescaled) mix,
   * matching `MDXSeparator.separate`'s `invert_using_spec=False` branch,
   * which is what this model runs under (confirmed off the real model's
   * resolved config). The `is_match_mix=True` demix pass Python's code also
   * runs before that branch is real computation whose result only feeds the
   * `invert_using_spec=True` branch — skipped here since it changes nothing
   * this model's output depends on.
   */
  async separate(mix: [Float64Array, Float64Array]): Promise<{
    instrumental: [Float64Array, Float64Array]
    vocals: [Float64Array, Float64Array]
  }> {
    const peak = peakOf(mix)
    const normalizedMix: [Float64Array, Float64Array] = [mix[0].slice(), mix[1].slice()]
    normalizePeak(normalizedMix, 0.9)

    const demixed = await this.demixPrimary(normalizedMix)
    const instrumental: [Float64Array, Float64Array] = [
      demixed[0].map(v => v * peak),
      demixed[1].map(v => v * peak),
    ]
    normalizePeak(instrumental, 0.9)

    const { compensate } = this.config
    const vocals: [Float64Array, Float64Array] = [
      new Float64Array(normalizedMix[0].length),
      new Float64Array(normalizedMix[1].length),
    ]
    for (let channel = 0; channel < 2; channel++) {
      for (let n = 0; n < vocals[channel]!.length; n++) {
        vocals[channel]![n] = -instrumental[channel]![n]! * compensate + normalizedMix[channel]![n]!
      }
    }
    normalizePeak(vocals, 0.9)

    return { instrumental, vocals }
  }
}
