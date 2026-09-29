import { describe, expect, it } from 'vitest'
import { Fft } from '../../../server/lib/separators/fft'

/** The DFT by its definition: slow, and obviously right. */
function naiveDft(re: Float64Array, im: Float64Array): [Float64Array, Float64Array] {
  const n = re.length
  const outRe = new Float64Array(n)
  const outIm = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * ((k * t) % n)) / n
      outRe[k]! += re[t]! * Math.cos(angle) - im[t]! * Math.sin(angle)
      outIm[k]! += re[t]! * Math.sin(angle) + im[t]! * Math.cos(angle)
    }
  }
  return [outRe, outIm]
}

function random(n: number, seed: number): Float64Array {
  let state = seed
  return Float64Array.from({ length: n }, () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 30 - 1
  })
}

describe('Fft', () => {
  it.each([1, 2, 3, 4, 5, 8, 12, 20, 30, 60, 64, 96, 120, 320, 480])('matches the DFT at size %i', (n) => {
    const re = random(n, n)
    const im = random(n, n + 1)
    const [wantRe, wantIm] = naiveDft(re, im)

    new Fft(n).forward(re, im)

    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(wantRe[k]!, 9)
      expect(im[k]).toBeCloseTo(wantIm[k]!, 9)
    }
  })

  it.each([5120, 6144, 7680])('round-trips every catalog size, %i, to within float noise', (n) => {
    const re = random(n, 1)
    const im = random(n, 2)
    const fft = new Fft(n)
    const [inRe, inIm] = [re.slice(), im.slice()]

    fft.forward(re, im)
    fft.inverse(re, im)

    for (let i = 0; i < n; i++) {
      expect(Math.abs(re[i]! - inRe[i]!)).toBeLessThan(1e-12)
      expect(Math.abs(im[i]! - inIm[i]!)).toBeLessThan(1e-12)
    }
  })

  it('puts a pure tone in its own bin at 5120', () => {
    const n = 5120
    const re = Float64Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * 37 * t) / n))
    const im = new Float64Array(n)
    new Fft(n).forward(re, im)
    expect(re[37]).toBeCloseTo(n / 2, 6)
    expect(re[n - 37]).toBeCloseTo(n / 2, 6)
    expect(Math.abs(re[38]!)).toBeLessThan(1e-6)
  })

  it('refuses a size that is not made of 2, 3, and 5', () => {
    expect(() => new Fft(14)).toThrow(/2, 3, and 5/)
  })
})
