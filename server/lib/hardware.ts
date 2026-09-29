import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { candidateBackends, parseAccelerator, type Accelerator } from './separators/accelerator'
import { formatDetectCliArgs } from './separators/cli-args'
import { parseDetected, parseNotice } from './separators/progress'
import { childEnv, separateCliPath } from './tools'

/**
 * The machine hosting Akapela, as a Separation sees it — which is what
 * Settings describes, including to a Connected Desktop App on some other
 * machine entirely (ADR 0013 amendment).
 */
export interface Hardware {
  /**
   * Logical cores this process may use. `availableParallelism()` rather than
   * `os.cpus().length` because it is cgroup-aware: under compose's
   * `cpus: "8"` on a bigger host it answers 8, not the host's count.
   */
  cores: number
  /** The GPU backend a Separation can run on here, proven to work, or null. */
  accelerator: Accelerator | null
}

export function hostCores(): number {
  return Math.max(1, availableParallelism())
}

/** Long enough for DirectML to open every adapter a machine has; a detection that hangs finds nothing. */
const DETECT_TIMEOUT_MS = 120_000

/**
 * Works out this machine's hardware once, at server start. The GPU half runs
 * in the separation subprocess rather than here, so a backend that crashes as
 * it loads takes that process down and not the server, and the server never
 * loads onnxruntime at all. Anything that goes wrong means no GPU, logged —
 * a Separation still runs, on the CPU.
 */
export async function detectHardware(): Promise<Hardware> {
  const candidates = candidateBackends(process.platform, process.arch, Boolean(process.versions.electron))
  const accelerator = candidates.length === 0 ? null : await detectAccelerator(candidates)
  return { cores: hostCores(), accelerator }
}

function detectAccelerator(candidates: readonly string[]): Promise<Accelerator | null> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [separateCliPath(), ...formatDetectCliArgs(candidates)], { env: childEnv() })
    const timer = setTimeout(() => child.kill(), DETECT_TIMEOUT_MS)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += d))
    child.stderr.on('data', d => (stderr += d))
    const give = (why: string | null, accelerator: Accelerator | null) => {
      clearTimeout(timer)
      if (why) console.warn(`hardware acceleration: ${why}; separating on the CPU`)
      resolve(accelerator)
    }
    child.on('error', error => give(`could not start the detection subprocess: ${error.message}`, null))
    child.on('close', (code) => {
      const detected = parseDetected(stdout)
      if (detected === undefined) return give(stderr.trim() || `detection exited with code ${code}`, null)
      if (detected === null) {
        // Only said when every candidate failed: why each did.
        const reasons = stdout.split('\n').map(parseNotice).filter((n): n is string => n !== null)
        return give(reasons.length > 0 ? `no GPU backend worked (${reasons.join('; ')})` : null, null)
      }
      give(null, parseAccelerator(detected))
    })
  })
}
