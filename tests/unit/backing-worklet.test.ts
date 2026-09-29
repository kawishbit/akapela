import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The Backing Track worklet (`public/audio/rubberband-processor.js`) is a
 * self-contained script the browser loads by URL, so it is run here the way
 * an AudioWorkletGlobalScope runs it: in a context of its own, with the three
 * globals it expects, driving the real Rubber Band wasm one render quantum at
 * a time.
 */

const SAMPLE_RATE = 44100
const BLOCK = 128

type Message = { type: string, [key: string]: unknown }
type Channels = Float32Array[]

interface Processor {
  onMessage(message: Message): Promise<void>
  process(inputs: unknown[], outputs: Float32Array[][]): boolean
  readFrame: number
}

type BlendInto = (
  out: Float32Array, offset: number, layers: (Channels | undefined)[], channel: number,
  from: number, n: number, fromGains: number[], toGains: number[],
) => void

let wasm: Buffer

function loadWorklet(): { blendInto: BlendInto, create: () => { processor: Processor, sent: Message[] } } {
  const source = readFileSync(resolve('public/audio/rubberband-processor.js'), 'utf8')
  let Processor: (new () => Processor) | undefined
  const sent: Message[] = []
  const context = createContext({
    AudioWorkletProcessor: class {
      port = { postMessage: (message: Message) => sent.push(message), onmessage: null as unknown }
    },
    registerProcessor: (_name: string, processor: new () => Processor) => {
      Processor = processor
    },
    sampleRate: SAMPLE_RATE,
    WebAssembly,
  })
  runInContext(source, context)
  return {
    blendInto: context.blendInto as BlendInto,
    create: () => {
      sent.length = 0
      return { processor: new Processor!(), sent }
    },
  }
}

function sine(frequency: number, seconds: number, amplitude = 0.4): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE)
  return out
}

/** Amplitude of one frequency in `samples`, by Goertzel, over short windows so a stretcher's phase drift cannot cancel it. */
function toneAmplitude(samples: Float32Array, frequency: number): number {
  const window = 2048
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE)
  let total = 0
  let windows = 0
  for (let start = 0; start + window <= samples.length; start += window) {
    let previous = 0
    let beforePrevious = 0
    for (let i = start; i < start + window; i++) {
      const current = samples[i]! + coefficient * previous - beforePrevious
      beforePrevious = previous
      previous = current
    }
    const power = previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious
    total += (2 * Math.sqrt(Math.max(power, 0))) / window
    windows++
  }
  return windows === 0 ? 0 : total / windows
}

/** Runs the processor for `seconds` of output and returns its left channel. */
function render(processor: Processor, seconds: number): Float32Array {
  const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    const outputs = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
    processor.process([], outputs)
    out.set(outputs[0]![0]!, b * BLOCK)
  }
  return out
}

const INSTRUMENTAL_HZ = 220
const GUIDE_HZ = 660

async function playing(create: () => { processor: Processor, sent: Message[] }, layers: Channels[], gains: number[]) {
  const { processor, sent } = create()
  await processor.onMessage({ type: 'init', wasm: new Uint8Array(wasm).buffer })
  await processor.onMessage({ type: 'load', layers, gains })
  await processor.onMessage({ type: 'play' })
  return { processor, sent }
}

beforeAll(() => {
  wasm = readFileSync(resolve('node_modules/rubberband-wasm/dist/rubberband.wasm'))
})

describe('blendInto', () => {
  const { blendInto } = loadWorklet()
  const layer = (...values: number[]): Channels => [Float32Array.from(values)]

  it('copies one layer at unity exactly, which is all a single Backing Track ever was', () => {
    const out = new Float32Array(6)
    blendInto(out, 1, [layer(0.1, 0.2, 0.3, 0.4)], 0, 1, 3, [1], [1])
    expect([...out]).toEqual([0, 0.2, 0.3, 0.4, 0, 0].map(Math.fround))
  })

  it('sums the layers, each at its own gain', () => {
    const out = new Float32Array(2)
    blendInto(out, 0, [layer(0.5, 0.5), layer(0.2, 0.4)], 0, 0, 2, [1, 0.5], [1, 0.5])
    expect(out[0]).toBeCloseTo(0.6)
    expect(out[1]).toBeCloseTo(0.7)
  })

  it('moves a gain in a straight line across the run, so a level change never steps', () => {
    const out = new Float32Array(4)
    blendInto(out, 0, [layer(1, 1, 1, 1)], 0, 0, 4, [0], [1])
    expect([...out]).toEqual([0, 0.25, 0.5, 0.75])
  })

  it('adds nothing for a layer that is missing or silent', () => {
    const out = new Float32Array(2)
    blendInto(out, 0, [layer(0.5, 0.5), undefined], 0, 0, 2, [1, 1], [1, 1])
    expect([...out]).toEqual([0.5, 0.5])
    blendInto(out, 0, [layer(0.5, 0.5), layer(9, 9)], 0, 0, 2, [1, 0], [1, 0])
    expect([...out]).toEqual([0.5, 0.5])
  })

  it('is silence past the end of a layer shorter than the first', () => {
    const out = new Float32Array(3)
    blendInto(out, 0, [layer(0.5, 0.5, 0.5), layer(0.25)], 0, 0, 3, [1, 1], [1, 1])
    expect([...out]).toEqual([0.75, 0.5, 0.5])
  })

  it('plays a mono layer on every channel', () => {
    const out = new Float32Array(1)
    blendInto(out, 0, [[Float32Array.of(0.5), Float32Array.of(0.5)], layer(0.25)], 1, 0, 1, [1, 1], [1, 1])
    expect(out[0]).toBeCloseTo(0.75)
  })
})

describe('the Backing Track worklet, on Stems', () => {
  it('plays the Instrumental alone while the Guide Vocal is at zero', async () => {
    const { create } = loadWorklet()
    const instrumental = sine(INSTRUMENTAL_HZ, 3)
    const vocals = sine(GUIDE_HZ, 3)
    const { processor } = await playing(create, [[instrumental, instrumental], [vocals, vocals]], [1, 0])

    const out = render(processor, 1).subarray(SAMPLE_RATE / 4)
    expect(toneAmplitude(out, INSTRUMENTAL_HZ)).toBeGreaterThan(0.3)
    expect(toneAmplitude(out, GUIDE_HZ)).toBeLessThan(0.01)
  })

  it('raises the Guide Vocal live, with no reload, seek, or restart', async () => {
    const { create } = loadWorklet()
    const instrumental = sine(INSTRUMENTAL_HZ, 4)
    const vocals = sine(GUIDE_HZ, 4)
    const { processor, sent } = await playing(create, [[instrumental, instrumental], [vocals, vocals]], [1, 0])
    render(processor, 0.5)
    const readBefore = processor.readFrame
    sent.length = 0

    await processor.onMessage({ type: 'gains', gains: [1, 0.5] })
    const out = render(processor, 1)

    // Still reading onward from where it was, and nothing was reloaded.
    expect(processor.readFrame).toBeGreaterThan(readBefore)
    expect(sent.map(message => message.type).filter(type => type !== 'position')).toEqual([])
    const settled = out.subarray(SAMPLE_RATE / 2)
    expect(toneAmplitude(settled, GUIDE_HZ) / toneAmplitude(settled, INSTRUMENTAL_HZ)).toBeCloseTo(0.5, 1)
  })

  it('fades in a Vocals Stem that arrives after the load, wherever playback has got to', async () => {
    const { create } = loadWorklet()
    const instrumental = sine(INSTRUMENTAL_HZ, 4)
    const vocals = sine(GUIDE_HZ, 4)
    // The Guide Vocal was raised before its Stem had been fetched: the gain is
    // there, the layer is not yet.
    const { processor } = await playing(create, [[instrumental, instrumental]], [1, 1])
    const before = render(processor, 0.5).subarray(SAMPLE_RATE / 4)
    expect(toneAmplitude(before, GUIDE_HZ)).toBeLessThan(0.01)

    await processor.onMessage({ type: 'layer', index: 1, channels: [vocals, vocals] })
    const after = render(processor, 1).subarray(SAMPLE_RATE / 2)
    expect(toneAmplitude(after, GUIDE_HZ)).toBeGreaterThan(0.3)
    expect(toneAmplitude(after, INSTRUMENTAL_HZ)).toBeGreaterThan(0.3)
  })

  it('stretches the blend at the tempo asked for, as one signal', async () => {
    const { create } = loadWorklet()
    const instrumental = sine(INSTRUMENTAL_HZ, 3)
    const vocals = sine(GUIDE_HZ, 3)
    const { processor } = await playing(create, [[instrumental, instrumental], [vocals, vocals]], [1, 1])
    await processor.onMessage({ type: 'adjust', timeRatio: 1.25, pitchScale: 2 ** (2 / 12) })
    await processor.onMessage({ type: 'seek', frame: 0 })

    const out = render(processor, 1.5).subarray(SAMPLE_RATE / 4)
    const shifted = 2 ** (2 / 12)
    expect(toneAmplitude(out, INSTRUMENTAL_HZ * shifted)).toBeGreaterThan(0.2)
    expect(toneAmplitude(out, GUIDE_HZ * shifted)).toBeGreaterThan(0.2)
    // A second of output at a slower tempo reads less than a second of song.
    expect(processor.readFrame).toBeLessThan(1.5 * SAMPLE_RATE)
  })
})
