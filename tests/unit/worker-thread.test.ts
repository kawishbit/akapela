import { describe, expect, it } from 'vitest'
import { runInWorkerThread } from '../../server/lib/worker-thread'

describe('runInWorkerThread', () => {
  it('returns the function’s result', async () => {
    const result = await runInWorkerThread((input: { a: number, b: number }) => input.a + input.b, { a: 2, b: 3 })
    expect(result).toBe(5)
  })

  it('propagates a thrown error', async () => {
    await expect(
      runInWorkerThread(() => {
        throw new Error('the model refused this audio')
      }, undefined),
    ).rejects.toThrow('the model refused this audio')
  })

  it('reports progress while it runs', async () => {
    const seen: number[] = []
    const result = await runInWorkerThread(
      (_input: undefined, reportProgress: (percent: number) => void) => {
        reportProgress(30)
        reportProgress(70)
        return 'done'
      },
      undefined,
      percent => seen.push(percent),
    )
    expect(result).toBe('done')
    expect(seen).toEqual([30, 70])
  })

  it('does not block the event loop while the function spins the CPU', async () => {
    // A 150ms busy loop run in process would delay a concurrent 20ms timer by
    // however long it blocks the loop. If the timer still lands close to 20ms,
    // the busy loop genuinely ran somewhere else.
    let timerFired: number | null = null
    const start = Date.now()
    const timer = new Promise<void>((resolve) => {
      setTimeout(() => {
        timerFired = Date.now() - start
        resolve()
      }, 20)
    })

    const worker = runInWorkerThread((ms: number) => {
      const until = Date.now() + ms
      while (Date.now() < until) { /* spin, inside the worker thread */ }
      return 'spun'
    }, 150)

    await timer
    expect(timerFired).not.toBeNull()
    expect(timerFired!).toBeLessThan(120)
    await expect(worker).resolves.toBe('spun')
  })
})
