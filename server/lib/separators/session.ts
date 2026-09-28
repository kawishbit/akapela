import * as ort from 'onnxruntime-node'
import type { ModelSession } from './mdx-net.ts'

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
