/**
 * The Jobs this process is running right now, each with the controller that
 * stops it. The runner registers a Job as it claims it; cancelling one aborts
 * its controller and waits for the handler to let go, so the cleanup that
 * follows never races a handler still writing. The runner and the API share
 * a process, so this is all a cancel needs — nothing polls the row from
 * inside a handler.
 *
 * A cancel is a different signal from shutdown: `runForever`'s own signal
 * only stops the loop between Jobs, and never reaches a handler.
 */
export class RunningJobs {
  private readonly running = new Map<string, { controller: AbortController, finished: Promise<void> }>()

  /** Registers a Job as running. Call `finished` once its handler has returned or thrown. */
  start(jobId: string): { signal: AbortSignal, finished: () => void } {
    const controller = new AbortController()
    let finished!: () => void
    const done = new Promise<void>(resolve => (finished = resolve))
    this.running.set(jobId, { controller, finished: done })
    return {
      signal: controller.signal,
      finished: () => {
        this.running.delete(jobId)
        finished()
      },
    }
  }

  /** Aborts a running Job and resolves once its handler has stopped. False when it is not running here. */
  async abort(jobId: string): Promise<boolean> {
    const entry = this.running.get(jobId)
    if (!entry) return false
    entry.controller.abort()
    await entry.finished
    return true
  }
}
