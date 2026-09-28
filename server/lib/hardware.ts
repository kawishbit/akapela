import { availableParallelism } from 'node:os'

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
}

export function hostCores(): number {
  return Math.max(1, availableParallelism())
}
