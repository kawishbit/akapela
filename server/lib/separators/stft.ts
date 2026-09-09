// @ts-expect-error - ndarray-fft ships no types
import fft from 'ndarray-fft'
// @ts-expect-error - ndarray ships no types
import ndarray from 'ndarray'

/**
 * Short-Time Fourier Transform and its inverse, matching `torch.stft`/
 * `torch.istft` with `center=True`, a periodic Hann window, and one-sided
 * (real-input) spectra — exactly what
 * `worker/akapela_worker/uvr_lib_v5/stft.py`'s `STFT` class does, ported to TS
 * for ticket 05 (`.scratch/worker-to-typescript/`).
 *
 * `n_fft` for the model this backs (UVR-MDX-NET-Inst_HQ_3) is 6144 — not a
 * power of two, which rules out most JS FFT libraries. `ndarray-fft` computes
 * it via Bluestein's algorithm; verified against a known sine input (exact
 * peak bin, exact magnitude) and a forward+inverse round trip (~1e-10 error)
 * before this was written against it.
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

  constructor(nFft: number, hopLength: number, dimF: number) {
    this.nFft = nFft
    this.hopLength = hopLength
    this.dimF = dimF
    this.window = hannWindowPeriodic(nFft)
  }

  /** `channels` is `[left, right]`, each the same length (one demix chunk). */
  forward(channels: [Float64Array, Float64Array]): Spectrogram {
    const padded = channels.map(c => reflectPad(c, this.nFft / 2, this.nFft / 2))
    const nFrames = 1 + Math.floor((padded[0]!.length - this.nFft) / this.hopLength)
    const data = new Float64Array(4 * this.dimF * nFrames)

    const re = new Float64Array(this.nFft)
    const im = new Float64Array(this.nFft)
    for (let ch = 0; ch < 2; ch++) {
      const signal = padded[ch]!
      for (let t = 0; t < nFrames; t++) {
        const start = t * this.hopLength
        for (let n = 0; n < this.nFft; n++) {
          re[n] = signal[start + n]! * this.window[n]!
          im[n] = 0
        }
        fft(1, ndarray(re, [this.nFft]), ndarray(im, [this.nFft]))
        const reChannel = ch * 2
        const imChannel = ch * 2 + 1
        for (let f = 0; f < this.dimF; f++) {
          data[reChannel * this.dimF * nFrames + f * nFrames + t] = re[f]!
          data[imChannel * this.dimF * nFrames + f * nFrames + t] = im[f]!
        }
      }
    }
    return { data, dimF: this.dimF, nFrames }
  }

  /** Inverse of `forward`: the same four channels back to `[left, right]` time-domain samples. */
  inverse(spec: Spectrogram): [Float64Array, Float64Array] {
    const { data, dimF, nFrames } = spec
    const outLength = (nFrames - 1) * this.hopLength
    const paddedLength = outLength + this.nFft
    const result: [Float64Array, Float64Array] = [new Float64Array(paddedLength), new Float64Array(paddedLength)]
    const windowSum = new Float64Array(paddedLength)

    const fullRe = new Float64Array(this.nFft)
    const fullIm = new Float64Array(this.nFft)

    for (let ch = 0; ch < 2; ch++) {
      const reChannel = ch * 2
      const imChannel = ch * 2 + 1
      for (let t = 0; t < nFrames; t++) {
        fullRe.fill(0)
        fullIm.fill(0)
        for (let f = 0; f < dimF; f++) {
          fullRe[f] = data[reChannel * dimF * nFrames + f * nFrames + t]!
          fullIm[f] = data[imChannel * dimF * nFrames + f * nFrames + t]!
        }
        // dimF stops one bin short of the full one-sided spectrum (the
        // Nyquist bin was dropped on the way in); left at zero here, matching
        // stft.py's own zero-pad back up to `n_fft // 2 + 1` bins.
        // Conjugate-symmetric extension to the full n_fft spectrum, which is
        // what makes the complex IFFT below come out real-valued.
        for (let f = 1; f < this.nFft / 2; f++) {
          fullRe[this.nFft - f] = fullRe[f]!
          fullIm[this.nFft - f] = -fullIm[f]!
        }

        fft(-1, ndarray(fullRe, [this.nFft]), ndarray(fullIm, [this.nFft]))

        const start = t * this.hopLength
        const out = result[ch]!
        for (let n = 0; n < this.nFft; n++) {
          const windowed = fullRe[n]! * this.window[n]!
          out[start + n] = out[start + n]! + windowed
          if (ch === 0) windowSum[start + n] = windowSum[start + n]! + this.window[n]! * this.window[n]!
        }
      }
    }

    // Undo the window envelope (weighted overlap-add normalization), then
    // trim the `n_fft / 2` padding `forward` added on each side.
    const trim = this.nFft / 2
    const trimmed: [Float64Array, Float64Array] = [new Float64Array(outLength), new Float64Array(outLength)]
    for (let ch = 0; ch < 2; ch++) {
      const out = result[ch]!
      const dst = trimmed[ch]!
      for (let n = 0; n < outLength; n++) {
        const denom = windowSum[trim + n]!
        dst[n] = denom > 1e-11 ? out[trim + n]! / denom : 0
      }
    }
    return trimmed
  }
}
