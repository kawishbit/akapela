/**
 * A complex FFT for the sizes the Separation Models use. Every `nFft` in the
 * catalog factors into 2s, 3s, and 5s — 5120 is 4⁵·5, 6144 is 4⁵·2·3, 7680
 * is 4⁴·2·3·5 — so a mixed-radix Stockham FFT computes each one directly,
 * where `ndarray-fft` fell back to Bluestein's algorithm: three power-of-two
 * FFTs of twice the length, plus chirp multiplications, for every frame.
 * Ticket 08 of `.scratch/faster-separation/` measured that at about 2.5 ms a
 * frame, two thirds of a whole Separation; this is the replacement.
 *
 * Stockham's autosort form ping-pongs between two buffers, a radix per stage,
 * and needs no bit-reversal pass. Radix 4 and 2 have their butterflies
 * written out; 3 and 5 go through a small generic DFT, since each appears at
 * most once. The plan — factors and twiddles — is built once per size and
 * reused for every frame.
 *
 * Imports nothing, so `separate-cli.ts` can load it under plain Node.
 */

interface Stage {
  radix: number
  /** Length of each sub-transform this stage splits. */
  n: number
  /** Stride between elements of one sub-transform. */
  stride: number
  /** `n / radix`. */
  m: number
  /** `exp(-2πi·p·j/n)` for p < m and 1 ≤ j < radix, at `p * (radix - 1) + j - 1`. */
  twiddleRe: Float64Array
  twiddleIm: Float64Array
  /** `exp(-2πi·j·k/radix)`, for the generic butterfly. */
  rootRe: Float64Array
  rootIm: Float64Array
}

function factorize(n: number): number[] {
  const factors: number[] = []
  let rest = n
  while (rest % 4 === 0) {
    factors.push(4)
    rest /= 4
  }
  for (const radix of [2, 3, 5]) {
    while (rest % radix === 0) {
      factors.push(radix)
      rest /= radix
    }
  }
  if (rest !== 1) throw new Error(`the FFT handles sizes made of 2, 3, and 5 only, not ${n}`)
  return factors
}

export class Fft {
  readonly size: number
  private readonly stages: Stage[]
  private readonly scratchRe: Float64Array
  private readonly scratchIm: Float64Array

  constructor(size: number) {
    this.size = size
    this.scratchRe = new Float64Array(size)
    this.scratchIm = new Float64Array(size)
    this.stages = []
    let n = size
    let stride = 1
    for (const radix of size === 1 ? [] : factorize(size)) {
      const m = n / radix
      const twiddleRe = new Float64Array(m * (radix - 1))
      const twiddleIm = new Float64Array(m * (radix - 1))
      for (let p = 0; p < m; p++) {
        for (let j = 1; j < radix; j++) {
          const angle = (-2 * Math.PI * p * j) / n
          twiddleRe[p * (radix - 1) + j - 1] = Math.cos(angle)
          twiddleIm[p * (radix - 1) + j - 1] = Math.sin(angle)
        }
      }
      const rootRe = new Float64Array(radix * radix)
      const rootIm = new Float64Array(radix * radix)
      for (let j = 0; j < radix; j++) {
        for (let k = 0; k < radix; k++) {
          const angle = (-2 * Math.PI * ((j * k) % radix)) / radix
          rootRe[j * radix + k] = Math.cos(angle)
          rootIm[j * radix + k] = Math.sin(angle)
        }
      }
      this.stages.push({ radix, n, stride, m, twiddleRe, twiddleIm, rootRe, rootIm })
      n = m
      stride *= radix
    }
  }

  /**
   * In place: `re`/`im` become their forward DFT, `X[k] = Σ x[n]·e^(-2πikn/N)`,
   * unscaled — `numpy.fft.fft`'s convention.
   */
  forward(re: Float64Array, im: Float64Array): void {
    let xRe = re
    let xIm = im
    let yRe = this.scratchRe
    let yIm = this.scratchIm
    for (const stage of this.stages) {
      this.runStage(stage, xRe, xIm, yRe, yIm)
      ;[xRe, yRe] = [yRe, xRe]
      ;[xIm, yIm] = [yIm, xIm]
    }
    if (xRe !== re) {
      re.set(xRe)
      im.set(xIm)
    }
  }

  /** In place: the inverse DFT, scaled by 1/N so it undoes `forward` — `numpy.fft.ifft`'s convention. */
  inverse(re: Float64Array, im: Float64Array): void {
    const n = this.size
    for (let i = 0; i < n; i++) im[i] = -im[i]!
    this.forward(re, im)
    const scale = 1 / n
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! * scale
      im[i] = -im[i]! * scale
    }
  }

  private runStage(stage: Stage, xRe: Float64Array, xIm: Float64Array, yRe: Float64Array, yIm: Float64Array): void {
    const { radix, stride: s, m, twiddleRe: twr, twiddleIm: twi } = stage
    if (radix === 4) {
      for (let p = 0; p < m; p++) {
        const t = p * 3
        const w1r = twr[t]!
        const w1i = twi[t]!
        const w2r = twr[t + 1]!
        const w2i = twi[t + 1]!
        const w3r = twr[t + 2]!
        const w3i = twi[t + 2]!
        for (let q = 0; q < s; q++) {
          const i0 = q + s * p
          const i1 = i0 + s * m
          const i2 = i1 + s * m
          const i3 = i2 + s * m
          const a0r = xRe[i0]!
          const a0i = xIm[i0]!
          const a1r = xRe[i1]!
          const a1i = xIm[i1]!
          const a2r = xRe[i2]!
          const a2i = xIm[i2]!
          const a3r = xRe[i3]!
          const a3i = xIm[i3]!
          const s02r = a0r + a2r
          const s02i = a0i + a2i
          const d02r = a0r - a2r
          const d02i = a0i - a2i
          const s13r = a1r + a3r
          const s13i = a1i + a3i
          // -i·(a1 - a3)
          const d13r = a1i - a3i
          const d13i = a3r - a1r
          const o = q + s * 4 * p
          yRe[o] = s02r + s13r
          yIm[o] = s02i + s13i
          const b1r = d02r + d13r
          const b1i = d02i + d13i
          yRe[o + s] = b1r * w1r - b1i * w1i
          yIm[o + s] = b1r * w1i + b1i * w1r
          const b2r = s02r - s13r
          const b2i = s02i - s13i
          yRe[o + 2 * s] = b2r * w2r - b2i * w2i
          yIm[o + 2 * s] = b2r * w2i + b2i * w2r
          const b3r = d02r - d13r
          const b3i = d02i - d13i
          yRe[o + 3 * s] = b3r * w3r - b3i * w3i
          yIm[o + 3 * s] = b3r * w3i + b3i * w3r
        }
      }
      return
    }
    if (radix === 2) {
      for (let p = 0; p < m; p++) {
        const wr = twr[p]!
        const wi = twi[p]!
        for (let q = 0; q < s; q++) {
          const i0 = q + s * p
          const i1 = i0 + s * m
          const ar = xRe[i0]!
          const ai = xIm[i0]!
          const br = xRe[i1]!
          const bi = xIm[i1]!
          const o = q + s * 2 * p
          yRe[o] = ar + br
          yIm[o] = ai + bi
          const dr = ar - br
          const di = ai - bi
          yRe[o + s] = dr * wr - di * wi
          yIm[o + s] = dr * wi + di * wr
        }
      }
      return
    }
    // A small DFT per butterfly: radix 3 and 5, once each at most.
    const { rootRe, rootIm } = stage
    const aRe = new Float64Array(radix)
    const aIm = new Float64Array(radix)
    for (let p = 0; p < m; p++) {
      for (let q = 0; q < s; q++) {
        for (let k = 0; k < radix; k++) {
          aRe[k] = xRe[q + s * (p + k * m)]!
          aIm[k] = xIm[q + s * (p + k * m)]!
        }
        const o = q + s * radix * p
        for (let j = 0; j < radix; j++) {
          let br = 0
          let bi = 0
          for (let k = 0; k < radix; k++) {
            const rr = rootRe[j * radix + k]!
            const ri = rootIm[j * radix + k]!
            br += aRe[k]! * rr - aIm[k]! * ri
            bi += aRe[k]! * ri + aIm[k]! * rr
          }
          if (j === 0) {
            yRe[o] = br
            yIm[o] = bi
          }
          else {
            const wr = twr[p * (radix - 1) + j - 1]!
            const wi = twi[p * (radix - 1) + j - 1]!
            yRe[o + j * s] = br * wr - bi * wi
            yIm[o + j * s] = br * wi + bi * wr
          }
        }
      }
    }
  }
}
