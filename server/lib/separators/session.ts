import * as ort from 'onnxruntime-node'
import type { Accelerator, GpuBackend } from './accelerator.ts'
import type { ModelSession } from './mdx-net.ts'
import { PROBE_SIZE, probeModelBytes } from './probe-model.ts'

/**
 * How `separate-cli.ts` opens the model. Its own module so what a Separation
 * asks ONNX Runtime for is one pure function a test can read, rather than
 * something only observable by running the real model.
 */

/**
 * `threads` is the singer's core limit, already clamped to the machine
 * (`shared/separation.ts`). Left to itself, onnxruntime sizes its intra-op
 * pool off the *host's* core count (`std::thread::hardware_concurrency()`),
 * which knows nothing of a container's cgroup quota: on a host with more cores
 * than compose's `cpus:` limit it spins up a thread for each anyway, and the
 * contention turns minutes into tens of minutes. The limit is computed from
 * `availableParallelism()`, which is cgroup-aware, so that never happens.
 *
 * The CPU arena is off because the macOS Desktop App runs this file under
 * Electron's binary (`ELECTRON_RUN_AS_NODE`), whose allocator traps rather than
 * returning when the arena extends itself: the first `run` succeeds, the second
 * grows the arena and the subprocess dies with SIGTRAP ("exited with code
 * null"). Plain Node is unaffected either way, and without the arena a
 * separation takes the same time and differs only by float noise.
 */
export function cpuSessionOptions(threads: number): ort.InferenceSession.SessionOptions {
  return {
    executionProviders: ['cpu'],
    intraOpNumThreads: Math.max(1, Math.floor(threads)),
    enableCpuMemArena: false,
  }
}

export async function createCpuSession(modelPath: string, threads: number): Promise<ModelSession> {
  return ort.InferenceSession.create(modelPath, cpuSessionOptions(threads))
}

/**
 * The same session on a GPU backend. `threads` still matters: whatever the
 * backend cannot place on the GPU runs on the CPU pool. DirectML wants memory
 * patterns off and sequential execution (onnxruntime's own guidance for it);
 * the arena stays off for the same Electron reason as on the CPU.
 */
export function acceleratedSessionOptions(accelerator: Accelerator, threads: number): ort.InferenceSession.SessionOptions {
  const provider = accelerator.deviceId === undefined
    ? accelerator.backend
    : { name: accelerator.backend, deviceId: accelerator.deviceId }
  return {
    executionProviders: [provider as ort.InferenceSession.ExecutionProviderConfig],
    intraOpNumThreads: Math.max(1, Math.floor(threads)),
    enableCpuMemArena: false,
    ...(accelerator.backend === 'dml' ? { enableMemPattern: false, executionMode: 'sequential' as const } : {}),
  }
}

/**
 * Runs on the GPU until the GPU fails, then on the CPU for the rest (ADR 0013
 * amendment): a Separation never fails because of the GPU alone. Whether the
 * GPU session fails to open or fails partway through, the chunk it failed on
 * is run again on the CPU, so the output is whole. `onFallback` hears why,
 * once.
 */
export class FallbackSession implements ModelSession {
  private current: ModelSession | undefined
  private fellBack = false
  // Plain fields rather than parameter properties: Node's type stripping,
  // which runs this file as it is, does not support those.
  private readonly openPrimary: () => Promise<ModelSession>
  private readonly openFallback: () => Promise<ModelSession>
  private readonly onFallback: (error: unknown) => void

  constructor(
    openPrimary: () => Promise<ModelSession>,
    openFallback: () => Promise<ModelSession>,
    onFallback: (error: unknown) => void,
  ) {
    this.openPrimary = openPrimary
    this.openFallback = openFallback
    this.onFallback = onFallback
  }

  async run(feeds: Record<string, ort.Tensor>): Promise<Record<string, ort.Tensor>> {
    if (!this.current) {
      try {
        this.current = await this.openPrimary()
      }
      catch (error) {
        return this.fallBack(error, feeds)
      }
    }
    try {
      return await this.current.run(feeds)
    }
    catch (error) {
      if (this.fellBack) throw error
      return this.fallBack(error, feeds)
    }
  }

  private async fallBack(error: unknown, feeds: Record<string, ort.Tensor>): Promise<Record<string, ort.Tensor>> {
    this.fellBack = true
    this.onFallback(error)
    this.current = await this.openFallback()
    return this.current.run(feeds)
  }
}

/**
 * The backend this machine can actually separate on, or null. A backend only
 * counts once a session on it has run the probe model and given the right
 * answer — a package listing a provider proves nothing. DirectML adapters are
 * each tried and timed, and the fastest kept.
 */
export async function detectAccelerator(
  candidates: readonly GpuBackend[],
  open: (bytes: Uint8Array, options: ort.InferenceSession.SessionOptions) => Promise<ort.InferenceSession>
    = (bytes, options) => ort.InferenceSession.create(bytes, options),
  /** Hears why each adapter or backend that did not count failed, so a missing GPU can be explained. */
  onFailure: (accelerator: Accelerator, why: string) => void = () => {},
): Promise<Accelerator | null> {
  const bytes = probeModelBytes(PROBE_SIZE)
  const input = new Float32Array(PROBE_SIZE * PROBE_SIZE).fill(1 / PROBE_SIZE)
  let best: { accelerator: Accelerator, ms: number } | null = null

  for (const backend of candidates) {
    const deviceIds = backend === 'dml' ? [0, 1, 2, 3] : [undefined]
    for (const deviceId of deviceIds) {
      const accelerator: Accelerator = deviceId === undefined ? { backend } : { backend, deviceId }
      try {
        const session = await open(bytes, acceleratedSessionOptions(accelerator, 1))
        const feeds = { X: new ort.Tensor('float32', input, [PROBE_SIZE, PROBE_SIZE]) }
        await session.run(feeds) // the first run compiles
        const started = performance.now()
        let output: ort.Tensor | undefined
        for (let i = 0; i < 3; i++) output = (await session.run(feeds)).Y
        const ms = performance.now() - started
        await session.release?.()
        // Every element of a matrix of 1/n times itself is 1/n.
        const value = (output?.data as Float32Array | undefined)?.[0]
        if (value === undefined || Math.abs(value - 1 / PROBE_SIZE) > 1e-4) {
          onFailure(accelerator, `gave ${value} where the probe expects ${1 / PROBE_SIZE}`)
          continue
        }
        if (!best || ms < best.ms) best = { accelerator, ms }
      }
      catch (error) {
        // No such adapter, or the backend cannot load here: not a candidate.
        onFailure(accelerator, error instanceof Error ? error.message : String(error))
      }
    }
  }
  return best?.accelerator ?? null
}
