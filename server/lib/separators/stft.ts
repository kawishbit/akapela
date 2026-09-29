import { Fft } from './fft.ts'

/**
 * Short-Time Fourier Transform and its inverse, matching `torch.stft`/
 * `torch.istft` with `center=True`, a periodic Hann window, and one-sided
 * (real-input) spectra — exactly what
 * `worker/akapela_worker/uvr_lib_v5/stft.py`'s `STFT` class does, ported to TS
 * for ticket 05 (`.scratch/worker-to-typescript/`).
 *
 * `n_fft` is 5120 for `Inst_Main` and never a power of two for any catalog
 * model, which is why `fft.ts` is a mixed-radix FFT of its own. Both channels
 * are real, so each frame's left and right go through one complex transform
 * together — left as the real part, right as the imaginary — and are pulled
 * apart by conjugate symmetry afterwards: half the transforms, same answer.
 *
 * The imaginary planes carry the opposite sign to `torch.stft`'s: the model
 * sees each frame's complex conjugate. That is what this port has always fed
 * it — `ndarray-fft`, which it used until ticket 08 of
 * `.scratch/faster-separation/`, transforms with e^(+i) — and ticket 08 was a
 * speed-up held to 0.999 correlation with the Stems it made, so it kept the
 * convention rather than changing the output. Whether it should be torch's
 * instead is `.scratch/faster-separation/issues/09-stft-sign-convention.md`.
 *
 * The four output channels are, in order, left-real, left-imaginary,
 * right-real, right-imaginary — the same interleaving `stft.py` produces by
 * reshaping `torch.stft`'s `[..., 2]` real/imaginary axis into the channel
 * dimension, which is what lets the channel order match the ONNX model's
 * expected input without the model needing to know this is TypeScript.
 */

export interface Spectrogram {
  /** Flat, channel-major: `data[channel * dimF * nFrames + freq * nFrames + time]`. */
  data: Float64Array
  dimF: number
  nFrames: number
}

function hannWindowPeriodic(length: number): Float64Array {
  const window = new Float64Array(length)
  for (let n = 0; n < length; n++) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / length)
  return window
}

/** `numpy`/`torch`-style reflect padding: mirrors without repeating the edge sample. */
function reflectPad(x: Float64Array, padLeft: number, padRight: number): Float64Array {
  const n = x.length
  const out = new Float64Array(n + padLeft + padRight)
  for (let i = 0; i < padLeft; i++) out[i] = x[padLeft - i]!
  out.set(x, padLeft)
  for (let i = 0; i < padRight; i++) out[padLeft + n + i] = x[n - 2 - i]!
  return out
}

export class Stft {
  private readonly nFft: number
  private readonly hopLength: number
  private readonly dimF: number
  private readonly window: Float64Array
  private readonly fft: Fft
  private readonly frameRe: Float64Array
  private readonly frameIm: Float64Array

  constructor(nFft: number, hopLength: number, dimF: number) {
    this.nFft = nFft
    this.hopLength = hopLength
    this.dimF = dimF
    this.window = hannWindowPeriodic(nFft)
    this.fft = new Fft(nFft)
    this.frameRe = new Float64Array(nFft)
    this.frameIm = new Float64Array(nFft)
  }

  /** `channels` is `[left, right]`, each the same length (one demix chunk). */
  forward(channels: [Float64Array, Float64Array]): Spectrogram {
    const { nFft, hopLength, dimF, window, frameRe: re, frameIm: im } = this
    const [left, right] = channels.map(c => reflectPad(c, nFft / 2, nFft / 2)) as [Float64Array, Float64Array]
    const nFrames = 1 + Math.floor((left.length - nFft) / hopLength)
    const data = new Float64Array(4 * dimF * nFrames)
    const plane = dimF * nFrames

    for (let t = 0; t < nFrames; t++) {
      const start = t * hopLength
      for (let n = 0; n < nFft; n++) {
        re[n] = left[start + n]! * window[n]!
        im[n] = right[start + n]! * window[n]!
      }
      this.fft.forward(re, im)
      // Z = L + iR, so L[k] = (Z[k] + conj(Z[-k])) / 2 and
      // R[k] = (Z[k] - conj(Z[-k])) / 2i.
      for (let f = 0; f < dimF; f++) {
        const g = f === 0 ? 0 : nFft - f
        const at = f * nFrames + t
        // Imaginary parts negated: see the sign convention above.
        data[at] = (re[f]! + re[g]!) / 2
        data[plane + at] = (im[g]! - im[f]!) / 2
        data[2 * plane + at] = (im[f]! + im[g]!) / 2
        data[3 * plane + at] = (re[f]! - re[g]!) / 2
      }
    }
    return { data, dimF, nFrames }
  }

  /** Inverse of `forward`: the same four channels back to `[left, right]` time-domain samples. */
  inverse(spec: Spectrogram): [Float64Array, Float64Array] {
    const { nFft, hopLength, window, frameRe: re, frameIm: im } = this
    const { data, dimF, nFrames } = spec
    const plane = dimF * nFrames
    const outLength = (nFrames - 1) * hopLength
    const paddedLength = outLength + nFft
    const left = new Float64Array(paddedLength)
    const right = new Float64Array(paddedLength)
    const windowSum = new Float64Array(paddedLength)

    for (let t = 0; t < nFrames; t++) {
      // Each channel's spectrum, conjugate-symmetrically extended to the full
      // n_fft — what makes its inverse real — packed as Z = L + iR so one
      // inverse transform gives left in the real part and right in the
      // imaginary. Bins from dimF up to Nyquist are zero, matching stft.py's
      // own zero-pad back up to `n_fft // 2 + 1` bins. Bin 0's imaginary part
      // is dropped: it only ever adds an imaginary constant to its channel's
      // inverse, which the real-valued output discards anyway, and kept it
      // would leak into the other channel here.
      re.fill(0)
      im.fill(0)
      for (let f = 0; f < dimF; f++) {
        const at = f * nFrames + t
        // Imaginary parts negated back: see the sign convention above.
        const lRe = data[at]!
        const lIm = f === 0 ? 0 : -data[plane + at]!
        const rRe = data[2 * plane + at]!
        const rIm = f === 0 ? 0 : -data[3 * plane + at]!
        re[f] = lRe - rIm
        im[f] = lIm + rRe
        if (f > 0) {
          // conj(L[k]) + i·conj(R[k]) at -k
          re[nFft - f] = lRe + rIm
          im[nFft - f] = -lIm + rRe
        }
      }
      this.fft.inverse(re, im)

      const start = t * hopLength
      for (let n = 0; n < nFft; n++) {
        const w = window[n]!
        left[start + n] = left[start + n]! + re[n]! * w
        right[start + n] = right[start + n]! + im[n]! * w
        windowSum[start + n] = windowSum[start + n]! + w * w
      }
    }

    // Undo the window envelope (weighted overlap-add normalization), then
    // trim the `n_fft / 2` padding `forward` added on each side.
    const trim = nFft / 2
    const trimmed: [Float64Array, Float64Array] = [new Float64Array(outLength), new Float64Array(outLength)]
    for (const [channel, out] of [left, right].entries()) {
      const dst = trimmed[channel]!
      for (let n = 0; n < outLength; n++) {
        const denom = windowSum[trim + n]!
        dst[n] = denom > 1e-11 ? out[trim + n]! / denom : 0
      }
    }
    return trimmed
  }
}
