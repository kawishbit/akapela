import * as ort from 'onnxruntime-node'
import { describe, expect, it } from 'vitest'
import {
  candidateBackends,
  formatAccelerator,
  parseAccelerator,
  parseBackendList,
} from '../../../server/lib/separators/accelerator'
import { formatSeparateCliArgs, parseSeparateCliArgs } from '../../../server/lib/separators/cli-args'
import type { ModelSession } from '../../../server/lib/separators/mdx-net'
import { PROBE_SIZE, probeModelBytes } from '../../../server/lib/separators/probe-model'
import { cliOutputReader, formatDetected, formatFallback, parseDetected } from '../../../server/lib/separators/progress'
import { acceleratedSessionOptions, detectAccelerator, FallbackSession } from '../../../server/lib/separators/session'

describe('candidateBackends', () => {
  it('tries DirectML on Windows, CoreML on Apple Silicon, and CUDA on Linux x64 servers', () => {
    expect(candidateBackends('win32', 'x64', true)).toEqual(['dml'])
    expect(candidateBackends('darwin', 'arm64', true)).toEqual(['coreml'])
    expect(candidateBackends('linux', 'x64', false)).toEqual(['cuda'])
  })

  it('tries nothing in the Linux Desktop App, or where no backend ships', () => {
    expect(candidateBackends('linux', 'x64', true)).toEqual([])
    expect(candidateBackends('linux', 'arm64', false)).toEqual([])
    expect(candidateBackends('darwin', 'x64', false)).toEqual([])
  })
})

describe('an Accelerator on the command line', () => {
  it('reads back what was written', () => {
    for (const accelerator of [{ backend: 'dml', deviceId: 1 }, { backend: 'coreml' }] as const) {
      expect(parseAccelerator(formatAccelerator(accelerator))).toEqual(accelerator)
    }
  })

  it.each(['rocm', 'dml:-1', 'dml:x', 'cuda:0:1'])('refuses %j', (value) => {
    expect(parseAccelerator(value)).toBeNull()
  })

  it('travels with the Separation, and is absent when it runs on the CPU', () => {
    const base = { modelName: 'Inst_Main', modelPath: 'm', inputPath: 'i', instrumentalPath: 'a', vocalsPath: 'b', threads: 2 } as const
    expect(parseSeparateCliArgs(formatSeparateCliArgs({ ...base, accelerator: { backend: 'cuda' } })))
      .toEqual({ ...base, accelerator: { backend: 'cuda' } })
    expect(formatSeparateCliArgs(base)).not.toContain('--accelerator')
  })

  it('drops backends it does not know from a detect list', () => {
    expect(parseBackendList('dml,rocm,coreml')).toEqual(['dml', 'coreml'])
  })
})

describe('the detect answer', () => {
  it('is a backend, none, or nothing at all', () => {
    expect(parseDetected(`noise\n${formatDetected('dml:1')}`)).toBe('dml:1')
    expect(parseDetected(formatDetected(null))).toBeNull()
    expect(parseDetected('crashed')).toBeUndefined()
  })
})

describe('acceleratedSessionOptions', () => {
  it('names the adapter, keeps the core limit, and keeps the CPU arena off', () => {
    expect(acceleratedSessionOptions({ backend: 'dml', deviceId: 1 }, 5)).toMatchObject({
      executionProviders: [{ name: 'dml', deviceId: 1 }],
      intraOpNumThreads: 5,
      enableCpuMemArena: false,
    })
    expect(acceleratedSessionOptions({ backend: 'coreml' }, 2).executionProviders).toEqual(['coreml'])
  })
})

describe('the probe model', () => {
  it('is a real ONNX model: a matrix times itself', async () => {
    const session = await ort.InferenceSession.create(probeModelBytes(2))
    const { Y } = await session.run({ X: new ort.Tensor('float32', Float32Array.from([1, 2, 3, 4]), [2, 2]) })
    expect(Array.from(Y!.data as Float32Array)).toEqual([7, 10, 15, 22])
  })
})

describe('detectAccelerator', () => {
  /** Stands in for onnxruntime: adapters that answer the probe right after the given delay, and fail otherwise. */
  function fakeOpen(working: Record<string, number>) {
    return async (_bytes: Uint8Array, options: ort.InferenceSession.SessionOptions) => {
      const provider = options.executionProviders![0] as string | { name: string, deviceId?: number }
      const key = typeof provider === 'string' ? provider : `${provider.name}:${provider.deviceId}`
      const delay = working[key]
      if (delay === undefined) throw new Error(`no ${key}`)
      return {
        run: async () => {
          await new Promise(resolve => setTimeout(resolve, delay))
          return { Y: new ort.Tensor('float32', Float32Array.of(1 / PROBE_SIZE), [1]) }
        },
        release: async () => {},
      } as unknown as ort.InferenceSession
    }
  }

  it('keeps the fastest DirectML adapter that works', async () => {
    expect(await detectAccelerator(['dml'], fakeOpen({ 'dml:0': 60, 'dml:1': 0 }))).toEqual({ backend: 'dml', deviceId: 1 })
  })

  it('finds nothing when no backend opens', async () => {
    expect(await detectAccelerator(['cuda'], fakeOpen({}))).toBeNull()
  })

  it('does not count a backend that answers wrong', async () => {
    const wrong = async () => ({
      run: async () => ({ Y: new ort.Tensor('float32', new Float32Array(1), [1]) }),
    }) as unknown as ort.InferenceSession
    expect(await detectAccelerator(['coreml'], wrong)).toBeNull()
  })
})

describe('FallbackSession', () => {
  const feeds = { input: new ort.Tensor('float32', new Float32Array(1), [1]) }
  const answering = (label: number): ModelSession => ({
    run: async () => ({ output: new ort.Tensor('float32', Float32Array.of(label), [1]) }),
  })
  const label = async (session: ModelSession) => (await session.run(feeds)).output!.data[0]

  it('stays on the GPU while it works', async () => {
    const reasons: unknown[] = []
    const session = new FallbackSession(async () => answering(1), async () => answering(2), e => reasons.push(e))
    expect([await label(session), await label(session)]).toEqual([1, 1])
    expect(reasons).toEqual([])
  })

  it('finishes on the CPU when the GPU session will not open', async () => {
    const reasons: unknown[] = []
    const session = new FallbackSession(async () => {
      throw new Error('no device')
    }, async () => answering(2), e => reasons.push(e))
    expect(await label(session)).toBe(2)
    expect(reasons).toHaveLength(1)
  })

  it('reruns the chunk the GPU failed on, and every later one, on the CPU', async () => {
    let calls = 0
    const flaky: ModelSession = { run: async (f) => {
      if (++calls === 2) throw new Error('device removed')
      return answering(1).run(f)
    } }
    const reasons: unknown[] = []
    const session = new FallbackSession(async () => flaky, async () => answering(2), e => reasons.push(e))
    expect([await label(session), await label(session), await label(session)]).toEqual([1, 2, 2])
    expect(reasons).toHaveLength(1)
  })
})

describe('the fallback line', () => {
  it('reaches the Job with its reason', () => {
    const reasons: string[] = []
    cliOutputReader({ onFallback: r => reasons.push(r) })(`progress 1/2\n${formatFallback('device\nremoved')}`)
    expect(reasons).toEqual(['device removed'])
  })
})
