import { constants, setPriority } from 'node:os'

/**
 * Puts the process calling it below normal priority, so a Separation takes
 * only the CPU nothing else wants: a Take being recorded in a browser on the
 * same machine keeps its share, and an idle machine loses almost nothing
 * (ADR 0013 amendment). `PRIORITY_BELOW_NORMAL` is nice 10 on Linux and macOS
 * and `BELOW_NORMAL_PRIORITY_CLASS` on Windows.
 *
 * Called first thing in `separate-cli.ts`, before the model is opened. On
 * Linux a nice value belongs to a thread, not the process, and a thread
 * inherits it from whichever thread creates it — so ONNX Runtime's pool,
 * created later from this one, runs lowered too.
 *
 * Answers why it could not, rather than throwing: a sandbox that forbids it
 * should cost a Separation its politeness, never the Separation.
 */
export function lowerOwnPriority(set: (priority: number) => void = priority => setPriority(priority)): string | null {
  try {
    set(constants.priority.PRIORITY_BELOW_NORMAL)
    return null
  }
  catch (error) {
    return `could not lower the separation's priority: ${error instanceof Error ? error.message : String(error)}`
  }
}
