import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadRubberBand, RUBBER_BAND_OPTIONS, stretch, type RubberBand } from '../../../server/lib/stretch/rubberband'

const SAMPLE_RATE = 44100

function sine(frequency: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE)
  return out
}

/** Rising zero crossings per second over the middle of the signal, clear of the edges. */
function frequencyOf(samples: Float32Array): number {
  const start = Math.floor(samples.length * 0.25)
  const end = Math.floor(samples.length * 0.75)
  let crossings = 0
  for (let i = start + 1; i < end; i++) if (samples[i - 1]! < 0 && samples[i]! >= 0) crossings++
  return crossings / ((end - start) / SAMPLE_RATE)
}

let rubberBand: RubberBand

beforeAll(async () => {
  rubberBand = await loadRubberBand(readFileSync(resolve('node_modules/rubberband-wasm/dist/rubberband.wasm')))
})

describe('stretch', () => {
  it('shifts the pitch without changing the length', () => {
    const input = sine(220, 2)

    const [left, right] = stretch(rubberBand, [input, input], SAMPLE_RATE, { timeRatio: 1, pitchScale: 2 ** (5 / 12) })

    expect(Math.abs(left!.length - input.length)).toBeLessThan(SAMPLE_RATE * 0.05)
    expect(right!.length).toBe(left!.length)
    expect(frequencyOf(left!)).toBeCloseTo(220 * 2 ** (5 / 12), -1)
  })

  it('lengthens a slower tempo without changing the pitch', () => {
    const input = sine(440, 2)

    const [left] = stretch(rubberBand, [input, input], SAMPLE_RATE, { timeRatio: 1.5, pitchScale: 1 })

    expect(Math.abs(left!.length - input.length * 1.5)).toBeLessThan(SAMPLE_RATE * 0.05)
    expect(frequencyOf(left!)).toBeCloseTo(440, -1)
  })

  it('starts on the first input frame rather than on Rubber Band’s start delay', () => {
    const silence = new Float32Array(SAMPLE_RATE)
    const input = new Float32Array(SAMPLE_RATE * 2)
    input.set(silence)
    input.set(sine(440, 1), SAMPLE_RATE)

    const [left] = stretch(rubberBand, [input, input], SAMPLE_RATE, { timeRatio: 1, pitchScale: 1.2 })

    const firstLoud = left!.findIndex(sample => Math.abs(sample) > 0.1)
    expect(Math.abs(firstLoud - SAMPLE_RATE)).toBeLessThan(SAMPLE_RATE * 0.05)
  })
})

describe('RUBBER_BAND_OPTIONS', () => {
  // The live preview's stretcher is a self-contained AudioWorklet file that
  // cannot import this module, so the two copies of the flags are held
  // together here: an export that sounds different from the preview is the
  // bug this whole design exists to avoid (ADR 0003).
  it('is the option set the browser engine’s worklet stretches with', () => {
    const worklet = readFileSync(resolve('public/audio/rubberband-processor.js'), 'utf8')
    const flags = Object.fromEntries(
      [...worklet.matchAll(/^const (OPTION_\w+) = (0x[0-9a-f]+)$/gim)].map(([, name, value]) => [name, Number(value)]),
    )
    const expression = worklet.match(/^const OPTIONS = ([\s\S]+?)\n\n/m)?.[1]
    expect(expression).toBeDefined()
    const workletOptions = expression!
      .split('|')
      .map(name => flags[name.trim()])
      .reduce((all, flag) => all! | flag!, 0)

    expect(workletOptions).toBe(RUBBER_BAND_OPTIONS)
  })
})
