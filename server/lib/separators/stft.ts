// `ndarray-fft`'s public export (`ndfft`) treats an N-d ndarray as an N-d
// FFT — transforming every axis — so it can't batch "many independent 1-D
// signals" the way this module needs to. Its row-batched engine can:
// `lib/fft-matrix.js` (undocumented, but stable — this package hasn't
// published since 1.0.3, and is pinned exactly in the lockfile) transforms
// `nrows` independent length-`ncols` signals packed into one flat buffer,
// computing the non-power-of-two (Bluestein) twiddle/chirp tables once for
// the whole batch instead of once per signal. That reuse is the entire
// point of reaching past the package's main entry point: `n_fft` here is
// 5120, not a power of two, and Bluestein's setup — an O(n log n) FFT of
// its own, run to build the chirp tables — dominated real runtime when
// `forward`/`inverse` called the public API once per STFT frame (hundreds of
// `fft()` calls per model chunk, each rebuilding those tables from scratch).
// @ts-expect-error - ndarray-fft ships no types, and this subpath isn't in its "main"
import fftm from 'ndarray-fft/lib/fft-matrix.js'

/**
 * Short-Time Fourier Transform and its inverse, matching `torch.stft`/
 * `torch.istft` with `center=True`, a periodic Hann window, and one-sided
 * (real-input) spectra — exactly what
 * `worker/akapela_worker/uvr_lib_v5/stft.py`'s `STFT` class does, ported to TS
 * for ticket 05 (`.scratch/worker-to-typescript/`).
 *
 * `n_fft` for the model this backs (UVR-MDX-NET-Inst_Main) is 5120 — not a
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

  /**
   * `real`/`imag` are `nrows` independent length-`nFft` signals, packed
   * row-major and transformed in place along that row axis — `nrows` frames
   * from a single channel, or frames from both channels stacked together,
   * transformed as one batch so `fftm` (see the import above) builds its
   * Bluestein tables once for the whole call rather than once per row.
   */
  private transformRows(dir: 1 | -1, real: Float64Array, imag: Float64Array, nrows: number): void {
    const ncols = this.nFft
    const rowLen = nrows * ncols
    // `fftm` (unlike the ndarray-fft entry point) works on a flat buffer with
    // integer offsets, real and imaginary parts included, sized for its own
    // Bluestein scratch space (`scratchMemory` is 0 when `ncols` is a power
    // of two, as the small STFT config the unit tests use is).
    const buffer = new Float64Array(2 * rowLen + fftm.scratchMemory(ncols))
    buffer.set(real, 0)
    buffer.set(imag, rowLen)
    fftm(dir, nrows, ncols, buffer, 0, rowLen, 2 * rowLen)
    real.set(buffer.subarray(0, rowLen))
    imag.set(buffer.subarray(rowLen, 2 * rowLen))
  }

  /** `channels` is `[left, right]`, each the same length (one demix chunk). */
  forward(channels: [Float64Array, Float64Array]): Spectrogram {
    const padded = channels.map(c => reflectPad(c, this.nFft / 2, this.nFft / 2))
    const nFrames = 1 + Math.floor((padded[0]!.length - this.nFft) / this.hopLength)
    const data = new Float64Array(4 * this.dimF * nFrames)

    // Rows 0..nFrames-1 are the left channel's frames, nFrames..2*nFrames-1
    // the right channel's — one batch covers both channels' whole STFT.
    const totalRows = 2 * nFrames
    const real = new Float64Array(totalRows * this.nFft)
    const imag = new Float64Array(totalRows * this.nFft)
    for (let ch = 0; ch < 2; ch++) {
      const signal = padded[ch]!
      for (let t = 0; t < nFrames; t++) {
        const start = t * this.hopLength
        const rowBase = (ch * nFrames + t) * this.nFft
        for (let n = 0; n < this.nFft; n++) real[rowBase + n] = signal[start + n]! * this.window[n]!
      }
    }

    this.transformRows(1, real, imag, totalRows)

    for (let ch = 0; ch < 2; ch++) {
      const reChannel = ch * 2
      const imChannel = ch * 2 + 1
      for (let t = 0; t < nFrames; t++) {
        const rowBase = (ch * nFrames + t) * this.nFft
        for (let f = 0; f < this.dimF; f++) {
          data[reChannel * this.dimF * nFrames + f * nFrames + t] = real[rowBase + f]!
          data[imChannel * this.dimF * nFrames + f * nFrames + t] = imag[rowBase + f]!
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

    // Same row-batching as `forward`: both channels' frames, conjugate-
    // symmetrically extended to the full spectrum, transformed in one call.
    const totalRows = 2 * nFrames
    const real = new Float64Array(totalRows * this.nFft)
    const imag = new Float64Array(totalRows * this.nFft)
    for (let ch = 0; ch < 2; ch++) {
      const reChannel = ch * 2
      const imChannel = ch * 2 + 1
      for (let t = 0; t < nFrames; t++) {
        const rowBase = (ch * nFrames + t) * this.nFft
        for (let f = 0; f < dimF; f++) {
          real[rowBase + f] = data[reChannel * dimF * nFrames + f * nFrames + t]!
          imag[rowBase + f] = data[imChannel * dimF * nFrames + f * nFrames + t]!
        }
        // dimF stops one bin short of the full one-sided spectrum (the
        // Nyquist bin was dropped on the way in); left at zero here, matching
        // stft.py's own zero-pad back up to `n_fft // 2 + 1` bins.
        // Conjugate-symmetric extension to the full n_fft spectrum, which is
        // what makes the complex IFFT below come out real-valued.
        for (let f = 1; f < this.nFft / 2; f++) {
          real[rowBase + this.nFft - f] = real[rowBase + f]!
          imag[rowBase + this.nFft - f] = -imag[rowBase + f]!
        }
      }
    }

    this.transformRows(-1, real, imag, totalRows)

    for (let ch = 0; ch < 2; ch++) {
      const out = result[ch]!
      for (let t = 0; t < nFrames; t++) {
        const rowBase = (ch * nFrames + t) * this.nFft
        const start = t * this.hopLength
        for (let n = 0; n < this.nFft; n++) {
          const windowed = real[rowBase + n]! * this.window[n]!
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
